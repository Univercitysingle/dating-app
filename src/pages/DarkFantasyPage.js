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
  ['video-rooms', 'Video room interest'],
];
const boundaryOptions = [
  ['no-explicit-media', 'Do not show explicit media'],
  ['no-unmatched-messages', 'No messages from unmatched users'],
  ['verified-adults-only', 'Prefer verified adults'],
  ['couples-only', 'Couples only'],
];

const DarkFantasyPage = () => {
  const location = useLocation();
  // UI visibility is not controlled by a build-time flag; the API enforces deployment, region, and payment gates.
  const [status, setStatus] = useState(null);
  const [checking, setChecking] = useState(true);
  const [profile, setProfile] = useState({ consent: false, interests: [], boundaries: [], visibility: 'private' });
  const [matches, setMatches] = useState([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [section, setSection] = useState('galleries');
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const [selectedCommunity, setSelectedCommunity] = useState(null);
  const [communityPosts, setCommunityPosts] = useState([]);
  const [communityPostText, setCommunityPostText] = useState('');
  const [communityCommentDrafts, setCommunityCommentDrafts] = useState({});
  const [communityBusy, setCommunityBusy] = useState(false);
  const [communityRequests, setCommunityRequests] = useState([]);
  const [videoRoomMode, setVideoRoomMode] = useState('private');
  const [videoRoomVisibility, setVideoRoomVisibility] = useState('invite');
  const [videoRoomCapacity, setVideoRoomCapacity] = useState('2');
  const [videoRoomTitle, setVideoRoomTitle] = useState('');
  const [videoRooms, setVideoRooms] = useState([]);
  const [videoRoomsLoading, setVideoRoomsLoading] = useState(false);
  const [videoRoomBusy, setVideoRoomBusy] = useState(false);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    let active = true;
    apiClient.get('/dark-fantasy/catalog')
      .then(result => { if (active) setCatalog(Array.isArray(result?.products) ? result.products : []); })
      .catch(() => { if (active) setCatalogError('Live product data is temporarily unavailable. You can still browse the official collections below.'); })
      .finally(() => { if (active) setCatalogLoading(false); });
  
  const loadVideoRooms = async () => {
    setVideoRoomsLoading(true);
    try {
      const result = await apiClient.get('/video-rooms');
      setVideoRooms(Array.isArray(result?.rooms) ? result.rooms : []);
    } catch (e) { setError(e.data?.error || e.message || 'Could not load Video Rooms.'); }
    finally { setVideoRoomsLoading(false); }
  };

  const createVideoRoom = async () => {
    setVideoRoomBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.post('/video-rooms', {
        mode: videoRoomMode, visibility: videoRoomMode === 'private' ? 'invite' : videoRoomVisibility,
        capacity: Number(videoRoomCapacity), title: videoRoomTitle.trim()
      });
      if (result?.room) setVideoRooms(current => [result.room, ...current.filter(room => room.roomId !== result.room.roomId)]);
      setNotice(result?.message || 'Room created.');
      await loadVideoRooms();
    } catch (e) { setError(e.data?.error || e.message || 'Could not create Video Room.'); }
    finally { setVideoRoomBusy(false); }
  };

  const updateVideoRoom = async (roomId, action) => {
    setVideoRoomBusy(true); setError(''); setNotice('');
    try {
      await apiClient.post('/video-rooms/' + encodeURIComponent(roomId) + '/' + action, {});
      setNotice(action === 'end' ? 'Room ended.' : action === 'leave' ? 'You left the room.' : 'You joined the room. Live media is not connected yet.');
      await loadVideoRooms();
    } catch (e) { setError(e.data?.error || e.message || 'Could not update Video Room.'); }
    finally { setVideoRoomBusy(false); }
  };

  useEffect(() => {
    if (section === 'videorooms' && status?.hasAccess) loadVideoRooms();
  }, [section, status?.hasAccess]);

  return () => { active = false; };
  }, []);

  useEffect(() => {
    const purchaseId = new URLSearchParams(location.search).get('purchaseId');
    if (!purchaseId) return undefined;
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
  }, [location.search, load]);

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

  const loadCommunity = async (slug) => {
    setCommunityBusy(true); setError('');
    try {
      const detail = await apiClient.get('/dark-fantasy/communities/' + encodeURIComponent(slug));
      setSelectedCommunity(detail);
      if (detail.membershipStatus === 'active') setCommunityPosts(await apiClient.get('/dark-fantasy/communities/' + encodeURIComponent(slug) + '/posts'));
      else setCommunityPosts([]);
    } catch (e) { setError(e.data?.error || e.message || 'Could not load this community.'); }
    finally { setCommunityBusy(false); }
  };

  const requestCommunityMembership = async () => {
    if (!selectedCommunity) return;
    setCommunityBusy(true); setError(''); setNotice('');
    try {
      const result = await apiClient.post('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/join', {});
      setSelectedCommunity(current => ({ ...current, membershipStatus: result.status }));
      setNotice(result.message || 'Membership request submitted.');
    } catch (e) { setError(e.data?.error || e.message || 'Could not request membership.'); }
    finally { setCommunityBusy(false); }
  };

  const loadCommunityRequests = async () => {
    if (!selectedCommunity) return;
    setCommunityBusy(true); setError('');
    try { setCommunityRequests(await apiClient.get('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/requests')); }
    catch (e) { setError(e.data?.error || e.message || 'Could not load membership requests.'); }
    finally { setCommunityBusy(false); }
  };

  const decideCommunityRequest = async (targetUid, decision) => {
    if (!selectedCommunity) return;
    setCommunityBusy(true); setError('');
    try {
      await apiClient.post('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/requests/' + encodeURIComponent(targetUid) + '/decision', { decision });
      setCommunityRequests(current => current.filter(item => item.uid !== targetUid));
      setNotice('Membership request ' + (decision === 'approve' ? 'approved.' : 'rejected.'));
    } catch (e) { setError(e.data?.error || e.message || 'Could not update membership request.'); }
    finally { setCommunityBusy(false); }
  };
  const createCommunityPost = async () => {
    if (!selectedCommunity || !communityPostText.trim()) return;
    setCommunityBusy(true); setError('');
    try {
      await apiClient.post('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/posts', { text: communityPostText });
      setCommunityPostText('');
      setCommunityPosts(await apiClient.get('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/posts'));
    } catch (e) { setError(e.data?.error || e.message || 'Could not publish your post.'); }
    finally { setCommunityBusy(false); }
  };

  const commentOnCommunityPost = async (postId) => {
    if (!selectedCommunity || !communityCommentDrafts[postId]?.trim()) return;
    setCommunityBusy(true); setError('');
    try {
      await apiClient.post('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/posts/' + encodeURIComponent(postId) + '/comments', { text: communityCommentDrafts[postId] });
      setCommunityCommentDrafts(current => ({ ...current, [postId]: '' }));
      setCommunityPosts(await apiClient.get('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/posts'));
    } catch (e) { setError(e.data?.error || e.message || 'Could not add your comment.'); }
    finally { setCommunityBusy(false); }
  };

  const reactToCommunityPost = async (postId, reaction) => {
    if (!selectedCommunity) return;
    setCommunityBusy(true); setError('');
    try {
      await apiClient.post('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/posts/' + encodeURIComponent(postId) + '/reaction', { reaction });
      setCommunityPosts(await apiClient.get('/dark-fantasy/communities/' + encodeURIComponent(selectedCommunity.slug) + '/posts'));
    } catch (e) { setError(e.data?.error || e.message || 'Could not update reaction.'); }
    finally { setCommunityBusy(false); }
  };
  const discover = async () => {
    setBusy(true); setError(''); setNotice('');
    try { setMatches(await apiClient.get('/dark-fantasy/discover')); }
    catch (e) { setError(e.data?.error || e.message || 'Could not load compatible profiles.'); }
    finally { setBusy(false); }
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="relative isolate mb-6 overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-6 text-white shadow-xl shadow-violet-950/10 sm:p-10 lg:p-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 h-56 w-56 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-violet-100 backdrop-blur"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-300" /> OPTIONAL · PRIVATE · ADULTS ONLY</div>
            <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">Dark Fantasy<span className="text-fuchsia-300">.</span></h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">Explore your interests at your own pace. Choose what to share, set your boundaries, and connect only when you feel ready.</p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-medium text-slate-100 sm:text-sm">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">🔐 Private by default</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">✓ Consent-led</span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-2">🛡️ Your boundaries matter</span>
            </div>
          </div>
          <div className="relative rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur sm:p-5 lg:max-w-xs">
            <p className="text-sm font-semibold text-white">You’re in control</p>
            <p className="mt-1 text-sm leading-5 text-slate-200">Your interests stay out of your regular dating profile. Discovery is opt-in, and you can delete your preferences at any time.</p>
            <button type="button" onClick={() => setSection("discover")} className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-violet-900">Manage private preferences <span aria-hidden="true" className="ml-2">→</span></button>
          </div>
        </div>
      </header>

      <nav aria-label="Dark Fantasy sections" className="sticky top-2 z-20 mb-6 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200/90 bg-white/95 p-2 shadow-lg shadow-slate-900/5 backdrop-blur">
        {[
          { key: "galleries", label: "Gallery & Shop" },
          { key: "discover", label: "My preferences" },
          { key: "videorooms", label: "Video Rooms" },
          { key: "communities", label: "Secrets Communities" },
          { key: "store", label: "Add-on Store" }
        ].map(item => (
          <button key={item.key} type="button" onClick={() => setSection(item.key)} aria-current={section === item.key ? "page" : undefined} className={`min-h-10 shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1 ${section === item.key ? "bg-slate-950 text-white shadow-sm" : "text-slate-700 hover:bg-violet-50 hover:text-violet-950"}`}>{item.label}</button>
        ))}
      </nav>

      {(notice || error) && (
        <div role={error ? "alert" : "status"} aria-live="polite" className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 text-sm shadow-sm ${error ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
          <span aria-hidden="true" className="mt-0.5 text-base">{error ? "!" : "✓"}</span>
          <div className="min-w-0 flex-1">{error || notice}</div>
          <button type="button" onClick={() => { setError(""); setNotice(""); }} className="rounded-lg px-2 py-1 font-semibold opacity-70 hover:bg-black/5 hover:opacity-100" aria-label="Dismiss message">Dismiss</button>
        </div>
      )}

      {section === "store" && <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">In-app purchases</p><h2 className="mt-2 text-2xl font-bold text-gray-900">Dark Fantasy Store</h2><p className="mt-2 text-sm text-gray-600">Browse the store without a Dark Fantasy subscription. Store items are purchased separately; gallery access and the Unlimited Pass are not required to browse or buy ordinary store items.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><article className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Creator Gallery — 30 days</h3><p className="mt-1 text-sm text-gray-600">Enable your own Dark Fantasy gallery for 30 days.</p><p className="mt-3 font-bold">LKR 800</p><button onClick={() => startPurchase("dark-fantasy-creator-monthly")} disabled={busy || status?.ageEligible === false || status?.accountEligible === false} className="mt-3 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Enable my gallery</button></article><article className="rounded-xl border border-violet-200 bg-violet-50 p-4"><h3 className="font-semibold">Unlimited Pass — 30 days</h3><p className="mt-1 text-sm text-gray-600">Access all eligible creator galleries while the pass is active.</p><p className="mt-3 font-bold">LKR 3,500</p><button onClick={() => startPurchase("dark-fantasy-unlimited-pass")} disabled={busy || status?.ageEligible === false || status?.accountEligible === false} className="mt-3 rounded-full bg-violet-800 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Get Unlimited Pass</button></article><article className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Individual Gallery — 30 days</h3><p className="mt-1 text-sm text-gray-600">Unlock a specific creator gallery from the Galleries tab.</p><p className="mt-3 font-bold">LKR 500 per gallery</p><p className="mt-2 text-xs text-gray-500">You only pay for the gallery you choose.</p></article></div><p className="mt-4 text-xs text-gray-500">Prices are pilot placeholders and checkout remains subject to server-side payment approval. Store browsing does not require an active add-on.</p></section>}

      {section === "galleries" && <section className="mb-6"><div className="mb-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wider text-violet-700">Public catalogue</p><h2 className="mt-2 text-2xl font-bold text-gray-900">Costumes, lingerie & intimate essentials</h2><p className="mt-2 text-sm text-gray-600">Browse products without purchasing a Dark Fantasy add-on. Product details and checkout are handled by Midnight Divas; selecting a product opens its official listing.</p><div className="mt-4 flex flex-wrap gap-2"><a className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" href="https://midnightdivas.com/collections/costumes" target="_blank" rel="noreferrer">Costumes</a><a className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" href="https://midnightdivas.com/collections/lingerie" target="_blank" rel="noreferrer">Lingerie</a><a className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" href="https://midnightdivas.com/collections/essentials" target="_blank" rel="noreferrer">Toys & essentials</a><a className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" href="https://midnightdivas.com/collections/all" target="_blank" rel="noreferrer">All products</a></div></div>{catalogLoading && <p className="mb-4 text-sm text-gray-600">Loading public product catalogue…</p>}{catalogError && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{catalogError}</p>}{catalog.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{catalog.map(product => <article key={product.id || product.url} className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">{product.image && <a href={product.url} target="_blank" rel="noreferrer"><img src={product.image} alt="" loading="lazy" className="h-56 w-full object-contain bg-white p-3" /></a>}<div className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{product.category || "Shop"}</p><h3 className="mt-1 font-semibold text-gray-900">{product.title}</h3>{product.price && <p className="mt-2 text-sm font-bold text-gray-900">Price on listing: {product.price}</p>}<p className="mt-2 text-xs text-gray-500">Price, currency, sizes, stock and checkout are confirmed on the seller's site.</p><a className="mt-3 inline-flex rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white" href={product.url} target="_blank" rel="noreferrer">View product</a></div></article>)}</div>}{!catalogLoading && catalog.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-gray-600">The live catalogue feed is unavailable right now. Use the official collection links above to browse current products.</div>}<div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-5"><h3 className="font-semibold text-violet-950">Private experiences are separate</h3><p className="mt-1 text-sm text-violet-900">Video Rooms and Secrets Communities require an active Dark Fantasy add-on and will remain locked for accounts without access.</p><button onClick={() => setSection("store")} className="mt-3 rounded-full bg-violet-900 px-4 py-2 text-sm font-semibold text-white">View add-on options</button></div></section>}

      {section === "videorooms" && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-slate-950 via-violet-950 to-fuchsia-950 p-6 text-white sm:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Live video experiences</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Video Rooms</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">Choose how you want to appear before creating a room. A private one-to-one show, an interactive group room, and a host-led broadcast are different experiences with different audience and privacy controls.</p>
        </div>

        <div className="space-y-6 p-5 sm:p-8">
          <div>
            <h3 className="text-lg font-bold text-slate-950">1. Choose your room format</h3>
            <p className="mt-1 text-sm text-slate-600">This choice determines who can publish video, who can watch, and how people join.</p>
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <button type="button" onClick={() => { setVideoRoomMode('private'); setVideoRoomCapacity('2'); }} aria-pressed={videoRoomMode === 'private'} className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${videoRoomMode === 'private' ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600' : 'border-slate-200 hover:border-violet-300'}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Private · 1:1</span>
                <span className="mt-2 block text-base font-bold text-slate-950">Individual show</span>
                <span className="mt-2 block text-sm leading-5 text-slate-600">Only the host and one specifically invited person can join. No public listing; the host approves the guest.</span>
                <span className="mt-3 block text-xs font-semibold text-slate-700">2 people · Two-way video</span>
              </button>
              <button type="button" onClick={() => { setVideoRoomMode('group'); setVideoRoomCapacity('4'); }} aria-pressed={videoRoomMode === 'group'} className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${videoRoomMode === 'group' ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600' : 'border-slate-200 hover:border-violet-300'}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Interactive · Group</span>
                <span className="mt-2 block text-base font-bold text-slate-950">Multi-person room</span>
                <span className="mt-2 block text-sm leading-5 text-slate-600">A host invites several participants. Each admitted person can publish their own camera and microphone when they choose.</span>
                <span className="mt-3 block text-xs font-semibold text-slate-700">Up to 6 people · Everyone can speak</span>
              </button>
              <button type="button" onClick={() => { setVideoRoomMode('broadcast'); setVideoRoomCapacity('25'); setVideoRoomVisibility('listed'); }} aria-pressed={videoRoomMode === 'broadcast'} className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 ${videoRoomMode === 'broadcast' ? 'border-violet-600 bg-violet-50 ring-1 ring-violet-600' : 'border-slate-200 hover:border-violet-300'}`}>
                <span className="text-xs font-bold uppercase tracking-wider text-fuchsia-700">Host-led · Audience</span>
                <span className="mt-2 block text-base font-bold text-slate-950">Broadcast room</span>
                <span className="mt-2 block text-sm leading-5 text-slate-600">The host appears on camera; viewers watch and interact with text or request-to-join controls. Viewers do not go on camera automatically.</span>
                <span className="mt-3 block text-xs font-semibold text-slate-700">Host video + audience · Larger scale</span>
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="text-lg font-bold text-slate-950">2. Set audience and room rules</h3>
            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="video-room-visibility" className="block text-sm font-semibold text-slate-800">Who can find this room?</label>
                <select id="video-room-visibility" value={videoRoomVisibility} onChange={event => setVideoRoomVisibility(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  <option value="invite">Invite only (recommended)</option>
                  <option value="listed">Listed in the room lobby</option>
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">Listed rooms show only the room title, host display name, audience format and current occupancy. Never expose email, phone number, or private profile fields.</p>
              </div>
              <div>
                <label htmlFor="video-room-capacity" className="block text-sm font-semibold text-slate-800">Maximum audience / participants</label>
                <select id="video-room-capacity" value={videoRoomCapacity} onChange={event => setVideoRoomCapacity(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500">
                  {(videoRoomMode === 'private' ? [['2','2 people']] : videoRoomMode === 'group' ? [['3','3 people'],['4','4 people'],['5','5 people'],['6','6 people']] : [['25','25 viewers'],['50','50 viewers'],['100','100 viewers']]).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <p className="mt-2 text-xs leading-5 text-slate-500">{videoRoomMode === 'broadcast' ? 'Broadcasts at this scale should use a WebRTC SFU/media service, not a peer-to-peer mesh.' : videoRoomMode === 'group' ? 'Small group rooms can use a mesh only at low participant counts; an SFU is preferable as the group grows.' : 'The invited guest must be approved before joining. Both people can end the call immediately.'}</p>
              </div>
            </div>
            <div className="mt-5 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-bold text-slate-900">Your selected setup</p>
              <p className="mt-1 text-sm text-slate-600">{videoRoomMode === 'private' ? 'Individual show: host + one approved guest, two-way video.' : videoRoomMode === 'group' ? 'Group room: multiple admitted participants with individual mic/camera controls.' : 'Broadcast: host publishes video to an audience; viewers need explicit approval before being promoted to on-camera participants.'}</p>
              <p className="mt-2 text-xs font-medium text-slate-500">Visibility: {videoRoomVisibility === 'invite' ? 'Invite only' : 'Listed in lobby'} · Capacity: {videoRoomCapacity}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-950">3. How joining works</h3>
              <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
                <li>Host creates a room and shares a time-limited invite link, or publishes a listing if selected.</li>
                <li>Guests see the host's public display name, room format and rules before requesting entry.</li>
                <li>Host admits or rejects each request. Joining never enables a camera or microphone by itself.</li>
                <li>Participants choose their devices and can mute, disable video, report, block or leave at any time.</li>
              </ol>
            </article>
            <article className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-950">4. Safety and privacy rules</h3>
              <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                <li>• Room access and capacity are enforced by the server, not just the UI.</li>
                <li>• Invite tokens expire and cannot grant host privileges to guests.</li>
                <li>• Only the host can remove participants or end a room for everyone.</li>
                <li>• No recording by default; any recording feature would need clear consent and separate safeguards.</li>
                <li>• Report/block controls and rate limits apply to room invitations and chat.</li>
              </ul>
            </article>
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <p className="font-bold text-violet-950">Bandwidth-saving defaults</p>
            <p className="mt-1 text-sm leading-6 text-violet-900">Private rooms are configured for adaptive peer-to-peer video; group and broadcast rooms are tagged for low-bitrate SFU delivery. Room records and access controls are active, but camera/audio transport is not connected, so creating a room does not start a live show.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Individual</p><p className="mt-1 text-sm font-semibold text-slate-900">Adaptive 360p, up to 720p</p><p className="mt-1 text-xs text-slate-600">Peer-to-peer where possible; TURN only when needed.</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Group</p><p className="mt-1 text-sm font-semibold text-slate-900">180p–360p tiles</p><p className="mt-1 text-xs text-slate-600">Limit simultaneous camera publishing.</p></div>
              <div className="rounded-xl bg-white p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Broadcast</p><p className="mt-1 text-sm font-semibold text-slate-900">Adaptive 360p–720p</p><p className="mt-1 text-xs text-slate-600">One host stream distributed by an SFU.</p></div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-lg font-bold text-slate-950">Create a room</h3><p className="mt-1 text-sm text-slate-600">Room metadata is stored server-side. Cameras never start automatically.</p></div><button type="button" onClick={loadVideoRooms} disabled={videoRoomsLoading || videoRoomBusy} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">{videoRoomsLoading ? 'Refreshing…' : 'Refresh rooms'}</button></div>
            <label htmlFor="video-room-title" className="mt-4 block text-sm font-semibold text-slate-800">Room title (optional)</label>
            <input id="video-room-title" value={videoRoomTitle} onChange={event => setVideoRoomTitle(event.target.value.slice(0, 80))} maxLength={80} placeholder="e.g. Evening chat" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500" />
            <button type="button" onClick={createVideoRoom} disabled={videoRoomBusy || checking || !status?.hasAccess} className="mt-4 min-h-11 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">{videoRoomBusy ? 'Working…' : 'Create room'}</button>
            {!status?.hasAccess && <button type="button" onClick={() => setSection('store')} className="ml-2 mt-4 min-h-11 rounded-xl border border-slate-300 px-5 py-3 text-sm font-semibold">View add-on options</button>}
            <div className="mt-5 space-y-3">
              {videoRooms.map(room => <article key={room.roomId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="font-bold text-slate-950">{room.title}</h4><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{room.mode}</span><span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{room.status}</span></div><p className="mt-1 text-xs text-slate-600">{room.hostDisplayName || (room.isHost ? 'You are hosting' : 'Host')} · {room.participantCount}/{room.capacity} people · {room.visibility === 'listed' ? 'Listed' : 'Invite only'}</p><p className="mt-1 text-xs text-amber-800">{room.mediaReady ? 'Media ready' : 'Room saved; live video not connected'}</p></div><div className="flex gap-2">{room.status === 'active' && room.isHost && <button type="button" onClick={() => updateVideoRoom(room.roomId, 'end')} disabled={videoRoomBusy} className="rounded-full border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">End room</button>}{room.status === 'active' && !room.isHost && !room.isParticipant && room.visibility === 'listed' && <button type="button" onClick={() => updateVideoRoom(room.roomId, 'join')} disabled={videoRoomBusy} className="rounded-full bg-violet-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Join room</button>}{room.status === 'active' && room.isParticipant && !room.isHost && <button type="button" onClick={() => updateVideoRoom(room.roomId, 'leave')} disabled={videoRoomBusy} className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">Leave</button>}</div></article>)}
              {!videoRoomsLoading && videoRooms.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">No rooms to display yet. Create one when your account has access.</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full border border-slate-200 px-3 py-2">Private by default</span>
            <span className="rounded-full border border-slate-200 px-3 py-2">Explicit consent</span>
            <span className="rounded-full border border-slate-200 px-3 py-2">Host moderation</span>
            <span className="rounded-full border border-slate-200 px-3 py-2">No automatic camera access</span>
          </div>
        </div>
      </section>}

      {section === "communities" && <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50 via-white to-fuchsia-50 p-6 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-700">Private member spaces</p><h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Secrets Communities</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Find your people in smaller, private spaces. Preview each community, read the rules, and request to join when it feels right.</p></div><div className="flex shrink-0 flex-wrap gap-2 text-xs font-semibold text-slate-700"><span className="rounded-full border border-violet-200 bg-white px-3 py-2">🔒 Private discussions</span><span className="rounded-full border border-violet-200 bg-white px-3 py-2">🤝 Consent first</span></div></div>
        </div>
        <div className="p-5 sm:p-8">
        <p className="text-sm leading-6 text-slate-600">Membership, discussions, and reactions are checked by the server on every request. Only share what you’re comfortable sharing.</p>
        {selectedCommunity ? <div className="mt-5">
          <button type="button" onClick={() => { setSelectedCommunity(null); setCommunityPosts([]); setError(""); }} className="mb-4 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold">← All communities</button>
          <div className="rounded-2xl bg-slate-950 p-5 text-white">
            <div className="flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold">{selectedCommunity.title}</h3><p className="mt-2 text-sm text-slate-200">{selectedCommunity.description}</p></div><span className="rounded-full bg-white/10 px-3 py-1 text-xs">{selectedCommunity.memberCount || 0} members</span></div>
            <p className="mt-3 text-xs text-slate-300">Membership: {selectedCommunity.membershipStatus || "none"}</p>
          </div>
          {selectedCommunity.canModerate && <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold text-violet-950">Membership requests</h4><button type="button" onClick={loadCommunityRequests} disabled={communityBusy} className="rounded-full border border-violet-300 px-3 py-1.5 text-sm font-semibold text-violet-950">Load requests</button></div>{communityRequests.length > 0 ? <div className="mt-3 space-y-2">{communityRequests.map(item => <div key={item.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3"><span className="text-xs text-gray-600">Member ID: {item.uid}</span><div className="flex gap-2"><button type="button" disabled={communityBusy} onClick={() => decideCommunityRequest(item.uid, "approve")} className="rounded-full bg-violet-800 px-3 py-1.5 text-xs font-semibold text-white">Approve</button><button type="button" disabled={communityBusy} onClick={() => decideCommunityRequest(item.uid, "reject")} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">Reject</button></div></div>)}</div> : <p className="mt-2 text-sm text-violet-900">Load the queue to review pending requests.</p>}</div>}
          <div className="mt-4 rounded-xl border border-slate-200 p-4"><h4 className="font-semibold text-gray-900">Community rules</h4><ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-gray-600">{(selectedCommunity.rules || []).map((rule, index) => <li key={index}>{rule}</li>)}</ul></div>
          {selectedCommunity.membershipStatus !== "active" ? <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 p-4"><p className="text-sm text-violet-950">{selectedCommunity.membershipStatus === "requested" ? "Your request is awaiting moderator review." : selectedCommunity.membershipStatus === "rejected" ? "Your previous request was not approved. You may submit a new request." : selectedCommunity.hasAccess ? "Request membership to participate in this private community." : "Community previews and rules are public. An active Dark Fantasy add-on is required to request membership and access private discussions."}</p><button type="button" onClick={() => selectedCommunity.hasAccess ? requestCommunityMembership() : setSection("store")} disabled={communityBusy || (selectedCommunity.hasAccess && selectedCommunity.membershipStatus === "requested")} className="mt-3 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{communityBusy ? "Please wait…" : selectedCommunity.membershipStatus === "requested" && selectedCommunity.hasAccess ? "Request pending" : selectedCommunity.hasAccess ? "Request to join" : "View add-on options"}</button></div> : <div className="mt-5">
            <label className="block text-sm font-semibold text-gray-900" htmlFor="community-post">Start a discussion</label><textarea id="community-post" value={communityPostText} onChange={e => setCommunityPostText(e.target.value)} maxLength={3000} rows={3} placeholder="Share a question or thought with members…" className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-sm" />
            <button type="button" onClick={createCommunityPost} disabled={communityBusy || !communityPostText.trim()} className="mt-2 rounded-full bg-violet-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Publish post</button>
            <div className="mt-6 space-y-4"><h4 className="font-semibold text-gray-900">Private discussion feed</h4>{communityPosts.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-gray-500">No posts yet. Start the first discussion.</p> : communityPosts.map(post => <article key={post.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-gray-900">{post.author || "Member"}</span><span className="text-xs text-gray-500">{post.createdAt ? new Date(post.createdAt).toLocaleString() : ""}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">{post.text}</p><div className="mt-3 flex flex-wrap gap-2">{[["like","Like"],["heart","Heart"],["support","Support"]].map(([reaction,label]) => <button key={reaction} type="button" disabled={communityBusy} onClick={() => reactToCommunityPost(post.id, reaction)} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">{label} · {(post.reactions || []).filter(r => r.type === reaction).length}</button>)}</div>
              <div className="mt-4 space-y-2 border-l-2 border-slate-100 pl-3">{(post.comments || []).map(comment => <div key={comment.id} className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-gray-700">{comment.author || "Member"}</p><p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{comment.text}</p></div>)}</div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={communityCommentDrafts[post.id] || ""} onChange={e => setCommunityCommentDrafts(current => ({ ...current, [post.id]: e.target.value }))} maxLength={1000} placeholder="Write a respectful comment…" className="min-w-0 flex-1 rounded-full border border-slate-300 px-4 py-2 text-sm" /><button type="button" onClick={() => commentOnCommunityPost(post.id)} disabled={communityBusy || !(communityCommentDrafts[post.id] || "").trim()} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Comment</button></div>
            </article>)}</div>
          </div>}
        </div> : <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{[
          ["gay-men", "Secret Gay Men", "A private space for gay men to connect and share experiences."],
          ["lesbian-women", "Secret Lesbian Women", "A private space for lesbian women, friendship and dating connections."],
          ["bisexual", "Secret Bi & Bi-curious", "For bisexual and bi-curious adults to explore identity and connect without judgement."],
          ["lgbtq-plus", "Secret LGBTQ+ Community", "A welcoming social space for LGBTQ+ adults."],
          ["trans-nonbinary", "Secret Trans & Non-binary", "Peer connection for transgender and non-binary adults."],
          ["swingers-swap", "Secret Swingers & Swap", "For consenting adults interested in ethical swinging and partner-swapping."],
          ["open-relationships", "Secret Open Relationships", "Discuss consensual non-monogamy, communication and boundaries."],
          ["polyamory", "Secret Polyamory & Throuples", "Connect around polyamory, triads and consensual relationship structures."],
          ["couples", "Secret Couples Connection", "A private space for couples seeking shared social connections."],
          ["kink-consent", "Secret Kink & Boundaries", "Discuss kink-related interests, safety, negotiation and consent."],
          ["friends-social", "Secret Friends & Social", "Meet people for friendship, community events and supportive conversations."],
          ["regional", "Secret Local Groups", "Find local interest groups where location-based discovery is available."]
        ].map(([slug, title, description]) => <button key={slug} type="button" onClick={() => loadCommunity(slug)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-950/5 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2"><div className="flex items-start justify-between gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-lg font-bold text-violet-900" aria-hidden="true">{title.includes("Gay") ? "♡" : title.includes("Lesbian") ? "✦" : title.includes("Bi") ? "◈" : title.includes("Trans") ? "✧" : title.includes("Couples") ? "♡" : title.includes("Kink") ? "◇" : "✺"}</div><span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">Private</span></div><h3 className="mt-4 font-bold text-slate-950 transition group-hover:text-violet-800">{title}</h3><p className="mt-2 min-h-[3.25rem] text-sm leading-5 text-slate-600">{description}</p><div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-xs font-semibold text-slate-500">Preview & rules</span><span className="text-sm font-bold text-violet-800 transition group-hover:translate-x-1">Explore <span aria-hidden="true">→</span></span></div></button>)}</div>}
        </div>
      </section>}
      {section === "discover" && checking && <section aria-live="polite" className="mb-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm"><span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200 border-t-violet-700" aria-hidden="true" />Checking your eligibility and add-on access…</section>}
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
