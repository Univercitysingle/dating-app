import React, { useEffect, useState } from 'react';
import apiClient from '../../api/apiClient';

const photoUrl = photo => typeof photo === 'string' ? photo : photo?.url || '';

const AdminPhotoVerificationsPage = () => {
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try { setItems(await apiClient.get('/admin/photo-verifications')); }
    catch (err) { setError(err.message || 'Could not load verification queue. Superadmin access is required.'); }
  };

  useEffect(() => { load(); }, []);

  const openEvidence = async item => {
    setError('');
    setBusy(true);
    try {
      const evidence = await apiClient.get('/admin/photo-verifications/' + item.id + '/evidence');
      setSelected({ ...evidence, automatedAssessment: item.automatedAssessment || null, videoUrl: 'data:' + evidence.mimeType + ';base64,' + evidence.videoBase64 });
    } catch (err) { setError(err.message || 'Could not load private evidence.'); }
    finally { setBusy(false); }
  };

  const review = async action => {
    if (!selected) return;
    if (action === 'reject' && reason.trim().length < 5) {
      setError('Enter a rejection reason of at least five characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await apiClient.post('/admin/photo-verifications/' + selected.id + '/action', { action, reason });
      setSelected(null);
      setReason('');
      await load();
    } catch (err) { setError(err.message || 'Review action failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Photo verification reviews</h1>
        <p className="mt-2 text-sm text-gray-600">Private selfie videos are available only to superadmins. Approve only when the live recording and profile photos reasonably match. This is a manual review, not certified identity verification.</p>
      </div>
      {error && <p role="alert" className="mb-4 rounded bg-red-50 p-3 text-red-700">{error}</p>}
      {selected ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <button type="button" onClick={() => setSelected(null)} className="mb-4 text-sm underline">Back to queue</button>
          <h2 className="text-lg font-semibold">{selected.user?.name || selected.uid}</h2>
          <p className="text-sm text-gray-600 mb-3">Challenge: {selected.challenge}</p>
          {selected.automatedAssessment?.status === 'assessed' ? (
            <div className="mb-4 rounded-lg border bg-slate-50 p-3 text-sm text-slate-700">
              <strong>Automated face assessment (advisory only)</strong>
              <p>Frames analyzed: {selected.automatedAssessment.framesAnalyzed}; frames with a detected face: {selected.automatedAssessment.framesWithFace}; profile photos compared: {selected.automatedAssessment.profilePhotosCompared}.</p>
              <p>Face distance: {selected.automatedAssessment.bestDistance == null ? 'Unavailable' : selected.automatedAssessment.bestDistance.toFixed(3)}. This is not an approval threshold or liveness result.</p>
            </div>
          ) : <p className="mb-4 text-sm text-amber-700">Automated assessment unavailable. Complete the manual review using the video and profile photos.</p>}
          <video controls playsInline className="w-full max-w-xl rounded-lg bg-black" src={selected.videoUrl} />
          <h3 className="mt-5 mb-2 font-semibold">Profile photos</h3>
          <div className="flex flex-wrap gap-3">
            {(selected.user?.photos || []).map((photo, index) => photoUrl(photo) ? <img key={index} src={photoUrl(photo)} alt="User profile" className="h-32 w-28 rounded-lg object-cover" /> : null)}
          </div>
          <label className="mt-5 block text-sm font-medium">Review note / rejection reason</label>
          <textarea value={reason} onChange={event => setReason(event.target.value)} maxLength={500} rows={3} className="mt-2 w-full rounded-lg border p-3" placeholder="Record the reason for your decision." />
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => review('approve')} className="rounded-lg bg-green-600 px-5 py-2 text-white disabled:opacity-50">Approve and verify</button>
            <button type="button" disabled={busy} onClick={() => review('reject')} className="rounded-lg bg-red-600 px-5 py-2 text-white disabled:opacity-50">Reject</button>
          </div>
        </section>
      ) : (
        <div className="space-y-3">
          {items.length ? items.map(item => (
            <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
              <div><strong>{item.user?.name || item.uid}</strong><p className="text-sm text-gray-500">Submitted {new Date(item.createdAt).toLocaleString()} · Challenge: {item.challenge} · Face assessment: {item.automatedAssessment?.status === 'assessed' ? 'available' : 'manual only'}</p></div>
              <button type="button" disabled={busy} onClick={() => openEvidence(item)} className="rounded-lg bg-gray-900 px-4 py-2 text-white disabled:opacity-50">Review private video</button>
            </article>
          )) : <p className="rounded-lg border bg-white p-5 text-gray-600">No pending photo verification requests.</p>}
        </div>
      )}
    </div>
  );
};

export default AdminPhotoVerificationsPage;
