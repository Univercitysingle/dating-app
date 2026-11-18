import React, { useCallback, useEffect, useState } from 'react';
import apiClient from '../api/apiClient';
import { toast } from 'react-toastify';
import { getUserFriendlyError } from '../utils/apiErrors';

const statusLabel = {
  pending: 'Awaiting response',
  accepted: 'Active',
  declined: 'Declined',
  revoked: 'Revoked'
};

export default function PartnerLinkPanel({ targetUid = null }) {
  const [links, setLinks] = useState([]);
  const [loading, setLoading] = useState(!targetUid);
  const [busyId, setBusyId] = useState('');
  const [sending, setSending] = useState(false);

  const loadLinks = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiClient.get('/users/me/partner-link');
      setLinks(Array.isArray(result?.links) ? result.links : []);
    } catch (error) {
      toast.error(getUserFriendlyError(error, 'Partner links could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!targetUid) loadLinks();
  }, [targetUid, loadLinks]);

  const invite = async () => {
    if (!targetUid || sending) return;
    setSending(true);
    try {
      await apiClient.post('/users/me/partner-link', { targetUid });
      toast.success('Partner-link invitation sent. The other member must accept before the link becomes active.');
      await loadLinks();
    } catch (error) {
      toast.error(getUserFriendlyError(error, 'The invitation could not be sent.'));
    } finally {
      setSending(false);
    }
  };

  const respond = async (action, linkId) => {
    if (!linkId || busyId) return;
    setBusyId(linkId);
    try {
      await apiClient.patch('/users/me/partner-link', { action, linkId });
      toast.success(action === 'accept' ? 'Partner link accepted.' : action === 'decline' ? 'Invitation declined.' : 'Partner link revoked.');
      await loadLinks();
    } catch (error) {
      toast.error(getUserFriendlyError(error, 'The partner-link request could not be updated.'));
    } finally {
      setBusyId('');
    }
  };

  if (targetUid) {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900" aria-label="Partner link invitation">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-white">Partner link</h3>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Invite this person to connect partner profiles. Nothing is linked unless they accept.</p>
          </div>
          <button type="button" onClick={invite} disabled={sending} className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {sending ? 'Sending…' : 'Invite to partner link'}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900" aria-labelledby="partner-link-title">
      <div className="mb-3">
        <h3 id="partner-link-title" className="font-semibold text-neutral-900 dark:text-white">Partner links</h3>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">Review invitations and manage connections. Either member can revoke an active link at any time.</p>
      </div>
      {loading ? <p className="text-sm text-neutral-500">Loading partner links…</p> : links.length === 0 ? (
        <p className="rounded-xl bg-neutral-50 p-4 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">You do not have any partner-link invitations or connections.</p>
      ) : (
        <ul className="space-y-3">
          {links.map(link => {
            const isIncoming = link.isIncoming === true;
            const actionable = link.status === 'pending' && isIncoming;
            return (
              <li key={link.id} className="flex flex-col gap-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">
                    {link.status === 'pending' ? (isIncoming ? 'Invitation received' : 'Invitation sent') : 'Partner connection'}
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{statusLabel[link.status] || link.status} · Reference {String(link.id).slice(-6)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {actionable && <>
                    <button type="button" onClick={() => respond('accept', link.id)} disabled={Boolean(busyId)} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Accept</button>
                    <button type="button" onClick={() => respond('decline', link.id)} disabled={Boolean(busyId)} className="rounded-full border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-600 disabled:opacity-50">Decline</button>
                  </>}
                  {(link.status === 'accepted' || (link.status === 'pending' && !actionable)) && (
                    <button type="button" onClick={() => respond('revoke', link.id)} disabled={Boolean(busyId)} className="rounded-full border border-red-300 px-4 py-2 text-sm text-red-700 dark:border-red-800 dark:text-red-300 disabled:opacity-50">Revoke</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">Partner linking is optional and available only to eligible adults. Your desires, curiosities and boundaries remain private and are not shared through a partner link.</p>
    </section>
  );
}
