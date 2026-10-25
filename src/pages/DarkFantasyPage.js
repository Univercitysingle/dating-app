import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import apiClient from '../api/apiClient';

const interestOptions = [
  ['couples', 'Couples'],
  ['threesome', 'Threesome'],
  ['ffm', 'FFM'],
  ['group-play', 'Consensual group play'],
  ['femdom', 'Femdom'],
  ['cuckold', 'Cuckold dynamics'],
  ['roleplay', 'Roleplay'],
  ['sensory-play', 'Sensory play'],
  ['lingerie', 'Lingerie'],
  ['intimacy-products', 'Intimacy products'],
  ['cam-shows', 'Cam-show interest'],
];
const boundaryOptions = [
  ['no-explicit-media', 'Do not show explicit media'],
  ['no-unmatched-messages', 'No messages from unmatched users'],
  ['verified-adults-only', 'Prefer verified adults'],
  ['couples-only', 'Couples only'],
];

const DarkFantasyPage = () => {
  const location = useLocation();
  const featureEnabled = String(process.env.REACT_APP_DARK_FANTASY_ENABLED || '').toLowerCase() === 'true';
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState({ consent: false, interests: [], boundaries: [], visibility: 'private' });
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [section, setSection] = useState('discover');

  const load = useCallback(async () => {
    if (!featureEnabled) return;
    setChecking(true);
    try {
      const nextStatus = await apiClient.get('/dark-fantasy/status');
      setStatus(nextStatus);
      if (nextStatus.hasAccess) {
        const nextProfile = await apiClient.get('/dark-fantasy/profile');
        setProfile({ consent: Boolean(nextProfile.consent), interests: nextProfile.interests || [], boundaries: nextProfile.boundaries || [], visibility: nextProfile.visibility || 'private' });
      }
    } catch (e) {
      setError(e.data?.error || e.message || 'Dark Fantasy is unavailable right now.');
    } finally {
      setChecking(false);
    }
  }, [featureEnabled]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const purchaseId = new URLSearchParams(location.search).get('purchaseId');
    if (!featureEnabled || !purchaseId) return undefined;
    let attempts = 0;
    const timer = setInterval(async () => {
      attempts += 1;
      try {
        const result = await apiClient.get(`/purchase/status/${encodeURIComponent(purchaseId)}`);
        if (result?.status === 'completed') {
          clearInterval(timer);
          setNotice('Payment confirmed. Your add-on access is being refreshed.');
          const url = new URL(window.location.href);
          url.searchParams.delete('purchaseId');
          window.history.replaceState({}, '', url);
          await load();
        } else if (result?.status === 'failed' || result?.status === 'rejected') {
          clearInterval(timer);
          setError('Payment was not completed. No add-on access was granted.');
        }
      } catch (e) {
        // The payment provider can take time to return the settlement result.
      }
      if (attempts >= 20) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [featureEnabled, location.search, load]);

  const toggle = (key, value) => setProfile(current => ({
    ...current,
    [key]: current[key].includes(value) ? current[key].filter(item => item !== value) : [...current[key], value],
  }));

  const startPurchase = async (itemId = 'dark-fantasy-monthly') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await apiClient.post('/dark-fantasy/purchase', { itemId });
      if (typeof response !== 'string' || !response.trim()) throw new Error('Checkout form was not returned.');
      const parsed = new DOMParser().parseFromString(response, 'text/html');
      const gatewayForm = parsed.querySelector('form');
      if (!gatewayForm?.action) throw new Error('Invalid payment checkout form.');
      const gatewayUrl = new URL(gatewayForm.action);
      if (gatewayUrl.protocol !== 'https:' || !['stagingxpay.info', 'govpay.webxpay.com'].includes(gatewayUrl.hostname)) {
        throw new Error('Unapproved payment gateway URL.');
      }
      const form = document.createElement('form');
      form.method = (gatewayForm.method || 'POST').toUpperCase();
      form.action = gatewayUrl.href;
      form.target = '_self';
      form.hidden = true;
      gatewayForm.querySelectorAll('input[name]').forEach(source => {
        const field = document.createElement('input');
        field.type = 'hidden'; field.name = source.name; field.value = source.value;
        form.appendChild(field);
      });
      if (!form.querySelector('input[name="payment"]')) throw new Error('Payment payload is missing.');
      document.body.appendChild(form);
      form.requestSubmit();
    } catch (e) {
      setError(e.data?.error || e.message || 'Could not start checkout.');
    } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await apiClient.put('/dark-fantasy/profile', profile);
      setProfile(current => ({ ...current, ...saved }));
      setNotice('Your private preferences have been saved.');
    } catch (e) { setError(e.data?.error || e.message || 'Could not save preferences.'); }
    finally { setBusy(false); }
  };

  const deletePreferences = async () => {
    if (!window.confirm('Delete your Dark Fantasy preferences and remove you from discovery?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiClient.delete('/dark-fantasy/profile');
      setProfile({ consent: false, interests: [], boundaries: [], visibility: 'private' });
      setMatches([]);
      setNotice('Your Dark Fantasy preferences were deleted.');
    } catch (e) { setError(e.data?.error || e.message || 'Could not delete preferences.'); }
    finally { setBusy(false); }
  };

  const discover = async () => {
    setBusy(true); setError(''); setNotice('');
    try { setMatches(await apiClient.get('/dark-fantasy/discover')); }
    catch (e) { setError(e.data?.error || e.message || 'Could not load compatible profiles.'); }
    finally { setBusy(false); }
  };

  if (!featureEnabled) {
    return <main className="mx-auto max-w-3xl p-6 sm:p-10"><section className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">Separate paid add-on</p><h1 className="mt-3 text-3xl font-bold text-gray-900">Dark Fantasy</h1><p className="mt-3 text-gray-600">This optional adult-interest experience is not enabled for this deployment yet.</p></section></main>;
  }

  return (
    <main className="mx-auto w-full max-w-5xl p-4 sm:p-8">
      <header className="mb-6 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-7 text-white sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-200">Optional paid add-on</p>
        <h1 className="mt-3 text-3xl font-bold sm:text-4xl">Dark Fantasy</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Private, opt-in adult-interest matching for eligible adults. Your interests are never included in ordinary dating profiles or shown to other users by default.</p>
      </header>

      <nav aria-label="Dark Fantasy sections" className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">{[["discover","Discover"],["galleries","Galleries"],["store","Dark Fantasy Store"]].map(([key,label]) => <button key={key} type="button" onClick={() => setSection(key)} aria-current={section === key ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${section === key ? "bg-slate-950 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{label}</button>)}</nav>

      {(notice || error) && <div role="status" className={`mb-5 rounded-xl border p-4 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>{error || notice}</div>}

      {section === "store" && <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">In-app purchases</p><h2 className="mt-2 text-2xl font-bold text-gray-900">Dark Fantasy Store</h2><p className="mt-2 text-sm text-gray-600">Browse the store without a Dark Fantasy subscription. Store items are purchased separately; gallery access and the Unlimited Pass are not required to browse or buy ordinary store items.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><article className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Creator Gallery — 30 days</h3><p className="mt-1 text-sm text-gray-600">Enable your own Dark Fantasy gallery for 30 days.</p><p className="mt-3 font-bold">LKR 800</p><button onClick={() => startPurchase("dark-fantasy-creator-monthly")} disabled={busy || status?.ageEligible === false || status?.accountEligible === false} className="mt-3 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Enable my gallery</button></article><article className="rounded-xl border border-violet-200 bg-violet-50 p-4"><h3 className="font-semibold">Unlimited Pass — 30 days</h3><p className="mt-1 text-sm text-gray-600">Access all eligible creator galleries while the pass is active.</p><p className="mt-3 font-bold">LKR 3,500</p><button onClick={() => startPurchase("dark-fantasy-unlimited-pass")} disabled={busy || status?.ageEligible === false || status?.accountEligible === false} className="mt-3 rounded-full bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Get Unlimited Pass</button></article><article className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Individual Gallery — 30 days</h3><p className="mt-1 text-sm text-gray-600">Unlock a specific creator gallery from the Galleries tab.</p><p className="mt-3 font-bold">LKR 500 per gallery</p><p className="mt-2 text-xs text-gray-500">You only pay for the gallery you choose.</p></article></div><p className="mt-4 text-xs text-gray-500">Prices are pilot placeholders and checkout remains subject to server-side payment approval. Store browsing does not require an active add-on.</p></section>}

      {section === "galleries" && <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Creator galleries</p><h2 className="mt-2 text-2xl font-bold text-gray-900">Browse galleries</h2><p className="mt-2 text-sm text-gray-600">Creators need an active Creator Gallery pass to publish. Visitors can unlock a single gallery for 30 days or use an Unlimited Pass. The access model is now defined; creator media upload, gallery moderation, and gated media delivery must be completed before live gallery content is enabled.</p><button onClick={() => setSection("store")} className="mt-4 rounded-full bg-slate-950 px-5 py-3 font-semibold text-white">View passes in Store</button></section>}

      {section === "discover" && checking && <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">Checking regional availability and add-on access…</section>}
      {section === "discover" && !checking && !status && <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">{error || 'This feature is unavailable in your region or for this deployment.'}</section>}
      {section === "discover" && !checking && status && status.accountEligible === false && <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><h2 className="font-semibold">This account is not eligible</h2><p className="mt-1 text-sm">Dark Fantasy access and purchases are unavailable for suspended or banned accounts.</p></section>}
      {section === "discover" && !checking && status && !status.ageEligible && <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><h2 className="font-semibold">Adult eligibility could not be confirmed</h2><p className="mt-1 text-sm">This feature requires an eligible adult account. Update your account verification through the supported process if your age is incorrect or unavailable.</p></section>}

      {section === "discover" && status && !checking && !status.hasAccess ? (
        <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">Separate purchase · not included with Premium</p>
          <h2 className="mt-2 text-2xl font-bold text-gray-900">Dark Fantasy access — 30 days</h2>
          <p className="mt-2 text-gray-600">LKR 1,200 for 30 days. Access is granted only after the server verifies a successful payment. Renewals are not automatic.</p>
          <ul className="mt-5 space-y-2 text-sm text-gray-700"><li>• Private interests and personal boundaries</li><li>• Opt-in compatibility discovery</li><li>• Independent visibility controls</li><li>• Block and report controls remain available</li></ul>
          <button type="button" onClick={startPurchase} disabled={busy || status?.ageEligible === false || status?.accountEligible === false} className="mt-6 rounded-full bg-slate-950 px-6 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Preparing checkout…' : 'Buy Dark Fantasy add-on'}</button>
          <button type="button" onClick={deletePreferences} disabled={busy} className="mt-3 rounded-full border border-red-200 px-5 py-2 text-sm font-semibold text-red-700 disabled:opacity-50">Delete previously saved preferences</button>
          <p className="mt-3 text-xs text-gray-500">Checkout availability depends on the deployment's legal and payment approval settings.</p>
        </section>
      ) : section === "discover" && status?.hasAccess ? (
        <>
          <section className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5 text-green-900"><p className="font-semibold">Add-on active</p><p className="mt-1 text-sm">Access until {status.accessUntil ? new Date(status.accessUntil).toLocaleDateString() : 'the expiry date shown by your account'}.</p></section>
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-bold text-gray-900">Your private preferences</h2>
            <p className="mt-1 text-sm text-gray-600">Choose only interests you want to use for compatibility. Nothing is shared unless you explicitly enable discovery.</p>
            <fieldset className="mt-6"><legend className="font-semibold text-gray-800">Interests</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{interestOptions.map(([value,label]) => <label key={value} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm"><input type="checkbox" checked={profile.interests.includes(value)} onChange={() => toggle('interests', value)} />{label}</label>)}</div></fieldset>
            <fieldset className="mt-6"><legend className="font-semibold text-gray-800">Boundaries and preferences</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{boundaryOptions.map(([value,label]) => <label key={value} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 text-sm"><input type="checkbox" checked={profile.boundaries.includes(value)} onChange={() => toggle('boundaries', value)} />{label}</label>)}</div></fieldset>
            <fieldset className="mt-6"><legend className="font-semibold text-gray-800">Visibility</legend><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4"><input type="radio" name="visibility" checked={profile.visibility === 'private'} onChange={() => setProfile(current => ({ ...current, visibility: 'private' }))} /><span><span className="block font-semibold">Private</span><span className="text-sm text-gray-500">Not shown in Dark Fantasy discovery.</span></span></label><label className="flex items-start gap-3 rounded-xl border border-gray-200 p-4"><input type="radio" name="visibility" checked={profile.visibility === 'discoverable'} onChange={() => setProfile(current => ({ ...current, visibility: 'discoverable' }))} /><span><span className="block font-semibold">Opt in to discovery</span><span className="text-sm text-gray-500">Only eligible, opted-in add-on members can see your ordinary public profile card.</span></span></label></div></fieldset>
            <label className="mt-6 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"><input type="checkbox" checked={profile.consent} onChange={e => setProfile(current => ({ ...current, consent: e.target.checked }))} /><span><span className="font-semibold">I explicitly opt in.</span> I confirm I am an adult, understand that these preferences are sensitive, and consent to their use only for this feature. I can turn off discovery or delete my preferences here.</span></label>
            <div className="mt-6 flex flex-wrap gap-3"><button type="button" onClick={save} disabled={busy || !profile.consent} className="rounded-full bg-slate-950 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save private preferences'}</button><button type="button" onClick={discover} disabled={busy || !profile.consent || profile.visibility !== 'discoverable'} className="rounded-full border border-slate-300 px-5 py-3 font-semibold text-slate-800 disabled:opacity-50">Find compatible profiles</button><button type="button" onClick={deletePreferences} disabled={busy} className="rounded-full border border-red-200 px-5 py-3 font-semibold text-red-700 disabled:opacity-50">Delete preferences</button></div>
          </section>
          <section className="mt-6"><h2 className="mb-3 text-xl font-bold text-gray-900">Compatible profiles</h2>{matches.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{matches.map(match => <article key={match.uid || match.id} className="rounded-2xl border border-gray-200 bg-white p-5"><h3 className="font-semibold text-gray-900">{match.name || 'Member'}</h3><p className="mt-1 text-sm text-gray-600">{match.age ? `${match.age} years old · ` : ''}${match.sharedInterestCount} shared interest(s)</p><p className="mt-3 text-xs text-gray-500">Interests remain private. Connect through the app's existing consent and matching features.</p></article>)}</div> : <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">No compatible profiles found yet. Keep discovery off until you are ready to be visible.</p>}</section>
        </>
      ) : null}
    </main>
  );
};

export default DarkFantasyPage;
