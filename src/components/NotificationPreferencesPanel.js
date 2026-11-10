import React, { useEffect, useMemo, useState } from 'react';
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
  { key: 'inApp', title: 'In-app alerts', detail: 'Show notification updates while you are using the app.' },
  { key: 'desktop', title: 'Browser notifications', detail: 'Show desktop notifications when this app is in the background.' },
  { key: 'sounds', title: 'Notification sounds', detail: 'Play a short sound for messages, matches and other activity.' },
  { key: 'callRingtone', title: 'Incoming call ringtone', detail: 'Play a repeating ringtone for incoming voice and video calls.' }
];

const EVENT_GROUPS = [
  {
    title: 'Dating activity',
    description: 'Stay informed about people and conversations.',
    items: [
      { key: 'newMatches', title: 'New matches', detail: 'When you and another member like each other.' },
      { key: 'newLikes', title: 'Likes and Super Likes', detail: 'When someone likes or Super Likes your profile.' },
      { key: 'profileViews', title: 'Profile activity', detail: 'Relevant profile views and interaction activity, when available.' }
    ]
  },
  {
    title: 'Calls and messages',
    description: 'Choose which communication alerts you receive.',
    items: [
      { key: 'newMessages', title: 'New messages', detail: 'When someone sends you a direct message.' },
      { key: 'voiceCalls', title: 'Voice calls', detail: 'Incoming and missed voice calls.' },
      { key: 'videoCalls', title: 'Video calls', detail: 'Incoming and missed video calls.' }
    ]
  },
  {
    title: 'Video Rooms',
    description: 'Updates about room invitations and reservations.',
    items: [
      { key: 'roomInvitations', title: 'Room invitations', detail: 'When someone invites you to join a Video Room.' },
      { key: 'roomBookings', title: 'Room bookings', detail: 'Booking requests, confirmations and changes.' }
    ]
  },
  {
    title: 'Account and support',
    description: 'Important information about your account and purchases.',
    items: [
      { key: 'subscriptionUpdates', title: 'Subscription updates', detail: 'Plan activation, renewal and cancellation updates.' },
      { key: 'paymentUpdates', title: 'Payment updates', detail: 'Successful, pending or failed payment status.' },
      { key: 'supportUpdates', title: 'Support updates', detail: 'Replies and changes to your support tickets.' },
      { key: 'securityAlerts', title: 'Security alerts', detail: 'Sign-in and important account-security activity.' }
    ]
  },
  {
    title: 'From the app',
    description: 'Hear about important improvements and new features.',
    items: [
      { key: 'productUpdates', title: 'Product announcements', detail: 'New features and important service announcements.' }
    ]
  }
];

function Toggle({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 dark:focus-visible:ring-offset-neutral-900 ${checked ? 'bg-indigo-600' : 'bg-neutral-300 dark:bg-neutral-600'}`}
    >
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

function PreferenceRow({ item, checked, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/60">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.title}</p>
        <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">{item.detail}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} label={item.title} disabled={disabled} />
    </div>
  );
}

function SectionHeading({ title, description, count }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-4 pb-3 pt-4">
      <div>
        <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{title}</h4>
        {description && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>}
      </div>
      {typeof count === 'number' && (
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
          {count} options
        </span>
      )}
    </div>
  );
}

export default function NotificationPreferencesPanel() {
  const [preferences, setPreferences] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [savingKeys, setSavingKeys] = useState([]);
  const [permission, setPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return undefined;
    navigator.serviceWorker.getRegistration('/')
      .then(registration => registration?.pushManager.getSubscription())
      .then(subscription => { if (active) setPushEnabled(Boolean(subscription)); })
      .catch(() => { if (active) setPushEnabled(false); });
    return () => { active = false; };
  }, []);

  const decodeApplicationServerKey = value => {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const raw = window.atob(padded);
    return Uint8Array.from(raw, character => character.charCodeAt(0));
  };

  const togglePushSubscription = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        toast.info('This browser does not support background push notifications.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const existing = await registration.pushManager.getSubscription();
      if (existing && pushEnabled) {
        await apiClient.delete('/push/subscriptions', { endpoint: existing.endpoint });
        await existing.unsubscribe();
        setPushEnabled(false);
        toast.success('Background push notifications disabled on this device.');
        return;
      }
      let currentPermission = Notification.permission;
      if (currentPermission === 'default') currentPermission = await Notification.requestPermission();
      setPermission(currentPermission);
      if (currentPermission !== 'granted') {
        toast.info(currentPermission === 'denied'
          ? 'Allow notifications for this site in your browser settings, then try again.'
          : 'Notification permission was not granted.');
        return;
      }
      const keyResponse = await apiClient.get('/push/vapid-public-key');
      if (!keyResponse?.publicKey) throw new Error('Push notifications are not configured on the server yet.');
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeApplicationServerKey(keyResponse.publicKey)
      });
      await apiClient.post('/push/subscriptions', subscription.toJSON());
      setPushEnabled(true);
      toast.success('Background push notifications enabled on this device.');
    } catch (error) {
      toast.error(error?.message || 'Could not update background push notifications.');
    } finally {
      setPushBusy(false);
    }
  };

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
        if (active) toast.error('Could not load notification settings. Your saved preferences have not been changed.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const enabledCount = useMemo(() => {
    const values = [...Object.values(preferences.channels), ...Object.values(preferences.events)];
    return values.filter(Boolean).length;
  }, [preferences]);

  const totalCount = Object.keys(DEFAULTS.channels).length + Object.keys(DEFAULTS.events).length;
  const allEnabled = enabledCount === totalCount;

  const updatePreference = async (group, key, value) => {
    const id = group + '.' + key;
    if (savingKeys.includes(id)) return;
    const previous = preferences;
    const next = { ...preferences, [group]: { ...preferences[group], [key]: value } };
    setPreferences(next);
    setSavingKeys(current => [...current, id]);
    try {
      const saved = await apiClient.put('/notification-preferences', { [group]: { [key]: value } });
      const merged = {
        channels: { ...DEFAULTS.channels, ...(saved?.channels || next.channels) },
        events: { ...DEFAULTS.events, ...(saved?.events || next.events) }
      };
      setPreferences(merged);
      window.dispatchEvent(new CustomEvent('dating-app-notification-preferences-updated', { detail: merged }));
      if (group === 'channels' && key === 'desktop' && value) {
        await requestBrowserPermission();
      }
      toast.success('Notification setting saved.', { autoClose: 1800 });
    } catch (error) {
      setPreferences(previous);
      toast.error(error.message || 'Could not save notification setting.');
    } finally {
      setSavingKeys(current => current.filter(item => item !== id));
    }
  };

  const requestBrowserPermission = async () => {
    if (!('Notification' in window)) {
      setPermission('unsupported');
      toast.info('This browser does not support desktop notifications.');
      return;
    }
    if (Notification.permission === 'granted') {
      setPermission('granted');
      toast.success('Browser notifications are allowed.');
      return;
    }
    if (Notification.permission === 'denied') {
      setPermission('denied');
      toast.info('Notifications are blocked. Allow them for this site in your browser settings.');
      return;
    }
    const result = await Notification.requestPermission();
    setPermission(result);
    toast[result === 'granted' ? 'success' : 'info'](
      result === 'granted' ? 'Browser notifications are now allowed.' : 'Browser notification permission was not granted.'
    );
  };

  const setAllPreferences = async (enabled) => {
    if (savingKeys.length) return;
    const next = {
      channels: Object.fromEntries(Object.keys(DEFAULTS.channels).map(key => [key, enabled])),
      events: Object.fromEntries(Object.keys(DEFAULTS.events).map(key => [key, enabled]))
    };
    setPreferences(next);
    setSavingKeys(['all']);
    try {
      const saved = await apiClient.put('/notification-preferences', next);
      const merged = {
        channels: { ...DEFAULTS.channels, ...(saved?.channels || next.channels) },
        events: { ...DEFAULTS.events, ...(saved?.events || next.events) }
      };
      setPreferences(merged);
      window.dispatchEvent(new CustomEvent('dating-app-notification-preferences-updated', { detail: merged }));
      if (enabled) await requestBrowserPermission();
      toast.success(enabled ? 'All notification preferences enabled.' : 'All notification preferences disabled.');
    } catch (error) {
      setPreferences(preferences);
      toast.error(error.message || 'Could not update notification preferences.');
    } finally {
      setSavingKeys([]);
    }
  };

  const permissionLabel = permission === 'granted' ? 'Allowed'
    : permission === 'denied' ? 'Blocked in browser'
      : permission === 'unsupported' ? 'Not supported' : 'Not yet allowed';

  return (
    <div className="profile-settings-group space-y-5">
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-gradient-to-br from-indigo-50 via-white to-white p-5 dark:border-neutral-700 dark:from-indigo-950/40 dark:via-neutral-900 dark:to-neutral-900 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                  <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <h3 className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">Notifications</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-neutral-600 dark:text-neutral-300">
              Control what you hear about and how alerts reach you. All notification preferences start enabled, and you can change them at any time.
            </p>
          </div>
          <div className="min-w-[132px] rounded-xl border border-indigo-100 bg-white/80 px-3 py-2.5 dark:border-indigo-900 dark:bg-neutral-900/70">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Notifications enabled</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-indigo-700 dark:text-indigo-300">{enabledCount}<span className="text-sm font-medium text-neutral-400"> / {totalCount}</span></p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-indigo-100 pt-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => setAllPreferences(!allEnabled)}
            disabled={loading || savingKeys.length > 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allEnabled ? 'Turn everything off' : 'Enable all notifications'}
          </button>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {loading ? 'Loading your preferences…' : savingKeys.length ? 'Saving changes…' : allEnabled ? 'All preferences are enabled' : 'Some preferences are turned off'}
          </span>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <SectionHeading title="How you receive alerts" description="Choose the delivery methods you want to use." count={CHANNELS.length} />
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          {CHANNELS.map(item => (
            <PreferenceRow
              key={item.key}
              item={item}
              checked={Boolean(preferences.channels[item.key])}
              disabled={loading || savingKeys.includes('channels.' + item.key) || savingKeys.includes('all')}
              onChange={value => updatePreference('channels', item.key, value)}
            />
          ))}
        </div>
        {preferences.channels.desktop && (
          <div className="flex flex-col gap-3 border-t border-neutral-100 bg-neutral-50 px-4 py-4 dark:border-neutral-800 dark:bg-neutral-800/40 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-200">Browser permission</p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Status: {permissionLabel}. Your browser controls whether desktop alerts can appear.</p>
            </div>
            <button
              type="button"
              onClick={requestBrowserPermission}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
            >
              {permission === 'granted' ? 'Check permission' : 'Allow browser notifications'}
            </button>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">Background push on this device</h4>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              Receive enabled call and message alerts when Hart2Hart is not open. Browser permission is required.
            </p>
            <p className="mt-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
              {pushEnabled ? 'Enabled on this device' : 'Not enabled on this device'}
            </p>
          </div>
          <button
            type="button"
            onClick={togglePushSubscription}
            disabled={pushBusy || loading || permission === 'unsupported'}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pushBusy ? 'Updating…' : pushEnabled ? 'Disable on this device' : 'Enable on this device'}
          </button>
        </div>
      </section>

      <div className="space-y-4">
        <div className="px-1">
          <h4 className="text-base font-bold text-neutral-900 dark:text-neutral-100">What you get notified about</h4>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">Manage each type independently. Turning off one category does not affect the others.</p>
        </div>
        {EVENT_GROUPS.map(group => (
          <section key={group.title} className="overflow-hidden rounded-2xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
            <SectionHeading title={group.title} description={group.description} count={group.items.length} />
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {group.items.map(item => (
                <PreferenceRow
                  key={item.key}
                  item={item}
                  checked={Boolean(preferences.events[item.key])}
                  disabled={loading || savingKeys.includes('events.' + item.key) || savingKeys.includes('all')}
                  onChange={value => updatePreference('events', item.key, value)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="px-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
        Note: Desktop notifications require browser permission. Sounds require the browser to allow audio playback after you interact with the app. Critical account-security and payment notices may also be shown in the app where required.
      </p>
    </div>
  );
}
