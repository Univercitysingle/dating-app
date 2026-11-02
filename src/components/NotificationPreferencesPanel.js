import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import apiClient from '../api/apiClient';

const DEFAULTS = {
  channels: { inApp: true, desktop: true, sounds: true, callRingtone: true },
  events: {
    newMatches: true, newLikes: true, newMessages: true,
    voiceCalls: true, videoCalls: true, profileViews: true,
    roomInvitations: true, roomBookings: true, subscriptionUpdates: true,
    paymentUpdates: true, supportUpdates: true, securityAlerts: true,
    productUpdates: true
  }
};

const CHANNELS = [
  { key: 'inApp', title: 'In-app notifications', detail: 'Show alerts while you are using the app.' },
  { key: 'desktop', title: 'Browser notifications', detail: 'Show desktop alerts when the app is in the background. Browser permission is required.' },
  { key: 'sounds', title: 'Notification sounds', detail: 'Play a short sound for new messages, matches and activity.' },
  { key: 'callRingtone', title: 'Incoming call ringtone', detail: 'Play a repeating ringtone for incoming voice and video calls.' }
];

const EVENTS = [
  { key: 'newMatches', title: 'New matches', detail: 'When you and another member like each other.' },
  { key: 'newLikes', title: 'Likes and Super Likes', detail: 'When someone likes or Super Likes your profile.' },
  { key: 'newMessages', title: 'New messages', detail: 'When someone sends you a direct message.' },
  { key: 'voiceCalls', title: 'Voice calls', detail: 'Incoming and missed voice calls.' },
  { key: 'videoCalls', title: 'Video calls', detail: 'Incoming and missed video calls.' },
  { key: 'profileViews', title: 'Profile activity', detail: 'Relevant profile views and interaction activity, when available.' },
  { key: 'roomInvitations', title: 'Video Room invitations', detail: 'Invitations to join a room.' },
  { key: 'roomBookings', title: 'Video Room bookings', detail: 'Booking requests, confirmations and changes.' },
  { key: 'subscriptionUpdates', title: 'Subscription updates', detail: 'Plan activation, renewal and cancellation updates.' },
  { key: 'paymentUpdates', title: 'Payment updates', detail: 'Successful, pending or failed payment status.' },
  { key: 'supportUpdates', title: 'Support updates', detail: 'Replies and changes to your support tickets.' },
  { key: 'securityAlerts', title: 'Security alerts', detail: 'Sign-in and important account-security activity.' },
  { key: 'productUpdates', title: 'Product announcements', detail: 'New features and important service announcements.' }
];

function PreferenceRow({ item, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.title}</span>
        <span className="mt-1 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">{item.detail}</span>
      </span>
      <input
        type="checkbox"
        className="h-5 w-5 shrink-0 cursor-pointer accent-indigo-600"
        checked={checked}
        onChange={onChange}
        aria-label={item.title}
      />
    </label>
  );
}

export default function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.get('/notification-preferences')
      .then(saved => {
        if (!active) return;
        setPreferences({
          channels: { ...DEFAULTS.channels, ...(saved?.channels || {}) },
          events: { ...DEFAULTS.events, ...(saved?.events || {}) }
        });
      })
      .catch(() => {
        if (active) toast.error('Could not load notification settings. Defaults are enabled until settings can be loaded.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const updatePreference = async (group, key, value) => {
    const previous = preferences;
    const next = { ...preferences, [group]: { ...preferences[group], [key]: value } };
    setPreferences(next);
    setSavingKey(group + '.' + key);
    try {
      const saved = await apiClient.put('/notification-preferences', { [group]: { [key]: value } });
      const merged = {
        channels: { ...DEFAULTS.channels, ...(saved?.channels || next.channels) },
        events: { ...DEFAULTS.events, ...(saved?.events || next.events) }
      };
      setPreferences(merged);
      window.dispatchEvent(new CustomEvent('dating-app-notification-preferences-updated', { detail: merged }));
      if (group === 'channels' && key === 'desktop' && value && 'Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          toast.info('Browser notifications are enabled in the app, but this browser has not granted notification permission.');
        }
      }
      toast.success('Notification preference updated.');
    } catch (error) {
      setPreferences(previous);
      toast.error(error.message || 'Could not save notification preference.');
    } finally {
      setSavingKey('');
    }
  };

  const enableDesktopPermission = async () => {
    if (!('Notification' in window)) {
      toast.info('This browser does not support desktop notifications.');
      return;
    }
    if (Notification.permission === 'granted') {
      toast.success('Browser notifications are already allowed.');
      return;
    }
    if (Notification.permission === 'denied') {
      toast.info('Notifications are blocked by browser settings. Allow them for this site in your browser settings.');
      return;
    }
    const permission = await Notification.requestPermission();
    toast[permission === 'granted' ? 'success' : 'info'](
      permission === 'granted' ? 'Browser notifications allowed.' : 'Browser notification permission was not granted.'
    );
  };

  return (
    <div className="profile-settings-group space-y-4">
      <div>
        <h3>Notifications</h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Notifications are enabled by default. Choose which alerts you receive and how they are delivered.
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Delivery preferences</h4>
        {CHANNELS.map(item => (
          <PreferenceRow
            key={item.key}
            item={item}
            checked={preferences.channels[item.key]}
            onChange={event => updatePreference('channels', item.key, event.target.checked)}
          />
        ))}
        {preferences.channels.desktop && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-neutral-50 px-4 py-3 dark:bg-neutral-900">
            <span className="text-xs text-neutral-600 dark:text-neutral-400">
              Browser permission: {typeof Notification === 'undefined' ? 'Not supported' : Notification.permission}
            </span>
            <button type="button" onClick={enableDesktopPermission} className="profile-settings-row-action">
              Manage browser permission
            </button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Notification categories</h4>
        {EVENTS.map(item => (
          <PreferenceRow
            key={item.key}
            item={item}
            checked={preferences.events[item.key]}
            onChange={event => updatePreference('events', item.key, event.target.checked)}
          />
        ))}
      </div>
      {loading && <p className="text-xs text-neutral-500">Loading saved notification preferences…</p>}
      {savingKey && <p className="text-xs text-neutral-500">Saving preference…</p>}
    </div>
  );
}
