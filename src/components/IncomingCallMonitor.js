import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';

const DEFAULT_PREFERENCES = {
  channels: { inApp: true, desktop: true, sounds: true, callRingtone: true },
  events: {
    newMatches: true, newLikes: true, newMessages: true,
    voiceCalls: true, videoCalls: true, profileViews: true,
    roomInvitations: true, roomBookings: true, subscriptionUpdates: true,
    paymentUpdates: true, supportUpdates: true, securityAlerts: true,
    productUpdates: true
  }
};

function categoryForNotification(type, notification = {}) {
  if (type === 'match') return 'newMatches';
  if (type === 'like' || type === 'superlike') return 'newLikes';
  if (type === 'missed_call') return notification.callType === 'video' ? 'videoCalls' : 'voiceCalls';
  if (type === 'message' || type === 'new_message') return 'newMessages';
  if (type === 'profile_view') return 'profileViews';
  if (type === 'room_invitation') return 'roomInvitations';
  if (type === 'room_booking' || type === 'booking_update') return 'roomBookings';
  if (type === 'subscription') return 'subscriptionUpdates';
  if (type === 'payment') return 'paymentUpdates';
  if (type === 'support') return 'supportUpdates';
  if (type === 'security') return 'securityAlerts';
  if (type === 'product_update') return 'productUpdates';
  return null;
}

export default function IncomingCallMonitor() {
  const { user } = useAuth();
  const audioRef = useRef({ context: null, ringtoneTimer: null });
  const preferencesRef = useRef(DEFAULT_PREFERENCES);
  const seenNotificationsRef = useRef(new Set());
  const seenMessagesRef = useRef(new Set());
  const initializedRef = useRef({ notifications: false, messages: false });
  const activeCallIdRef = useRef(null);
  const [incomingCall, setIncomingCall] = useState(null);
  const [callActionBusy, setCallActionBusy] = useState(false);
  const [callActionError, setCallActionError] = useState('');

  const answerIncomingCall = () => {
    if (!incomingCall?.roomId || callActionBusy) return;
    // Carry the explicit Answer gesture into the chat route. ChatCallPanel will
    // accept this exact call as soon as its authenticated call state is loaded.
    try {
      window.sessionStorage.setItem('dating-app-auto-answer-call', JSON.stringify({
        callId: String(incomingCall._id),
        roomId: String(incomingCall.roomId),
        requestedAt: Date.now()
      }));
    } catch (_) {}
    window.location.assign(`/chat/${encodeURIComponent(incomingCall.roomId)}`);
  };

  const rejectIncomingCall = async () => {
    if (!incomingCall?._id || callActionBusy) return;
    setCallActionBusy(true);
    setCallActionError('');
    try {
      await apiClient.post('/calls/action', {
        callId: String(incomingCall._id),
        action: 'decline'
      });
      setIncomingCall(null);
      activeCallIdRef.current = null;
    } catch (error) {
      setCallActionError(error?.data?.error || error?.data?.message || 'Could not reject the call. Please try again.');
    } finally {
      setCallActionBusy(false);
    }
  };

  useEffect(() => {
    if (!user?.uid) return undefined;
    let mounted = true;
    let callTimer = null;
    let activityTimer = null;
    let callInFlight = false;
    let activityInFlight = false;

    const stopRingtone = () => {
      if (audioRef.current.ringtoneTimer) {
        window.clearInterval(audioRef.current.ringtoneTimer);
        audioRef.current.ringtoneTimer = null;
      }
    };

    const getAudioContext = () => {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      if (!audioRef.current.context || audioRef.current.context.state === 'closed') {
        audioRef.current.context = new AudioContextClass();
      }
      return audioRef.current.context;
    };

    const playTone = (context, frequency = 740) => {
      if (!context || context.state !== 'running') return;
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const now = context.currentTime;
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(now);
        oscillator.stop(now + 0.21);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      } catch (_) {}
    };

    const startRingtone = () => {
      if (audioRef.current.ringtoneTimer || !preferencesRef.current.channels.callRingtone) return;
      const context = getAudioContext();
      if (!context) return;
      const ring = () => {
        if (context.state !== 'running') return;
        playTone(context, 880);
        window.setTimeout(() => playTone(context, 660), 260);
      };
      ring();
      audioRef.current.ringtoneTimer = window.setInterval(ring, 1800);
    };

    const notify = (title, body, category, url = null) => {
      const prefs = preferencesRef.current;
      if (!prefs.events[category]) return;
      if (prefs.channels.inApp && document.visibilityState === 'visible') {
        toast.info(`${title}: ${body}`, {
          autoClose: category === 'voiceCalls' || category === 'videoCalls' ? false : 7000,
          closeOnClick: Boolean(url),
          onClick: url ? () => window.location.assign(url) : undefined
        });
      }
      if (prefs.channels.sounds) playTone(getAudioContext(), 740);
      if (prefs.channels.desktop && document.visibilityState !== 'visible' &&
          'Notification' in window && Notification.permission === 'granted') {
        try {
          const notification = new Notification(title, { body, tag: `dating-app-${category}-${Date.now()}` });
          if (url) notification.onclick = () => {
            window.focus();
            window.location.assign(url);
            notification.close();
          };
        } catch (_) {}
      }
    };

    const unlockOnFirstGesture = () => {
      const context = getAudioContext();
      if (context?.state === 'suspended') context.resume().catch(() => {});
      if (preferencesRef.current.channels.desktop && 'Notification' in window &&
          Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      window.removeEventListener('pointerdown', unlockOnFirstGesture);
      window.removeEventListener('keydown', unlockOnFirstGesture);
    };
    window.addEventListener('pointerdown', unlockOnFirstGesture, { passive: true });
    window.addEventListener('keydown', unlockOnFirstGesture);

    const loadPreferences = async () => {
      try {
        const saved = await apiClient.get('/notification-preferences');
        if (mounted) {
          preferencesRef.current = {
            channels: { ...DEFAULT_PREFERENCES.channels, ...(saved?.channels || {}) },
            events: { ...DEFAULT_PREFERENCES.events, ...(saved?.events || {}) }
          };
        }
      } catch (_) {
        // Keep all notification categories enabled by default if preferences are temporarily unavailable.
      }
    };

    const onPreferencesUpdated = event => {
      const value = event.detail || {};
      preferencesRef.current = {
        channels: { ...DEFAULT_PREFERENCES.channels, ...(value.channels || {}) },
        events: { ...DEFAULT_PREFERENCES.events, ...(value.events || {}) }
      };
      if (!preferencesRef.current.channels.callRingtone) stopRingtone();
    };
    window.addEventListener('dating-app-notification-preferences-updated', onPreferencesUpdated);

    const checkCall = async () => {
      if (callInFlight) return;
      callInFlight = true;
      try {
        // Keep polling while the app is backgrounded so desktop notifications
        // can still be raised. A closed browser requires Web Push delivery.
        const result = await apiClient.get('/calls/incoming');
        if (!mounted) return;
        const call = result?.call;
        if (!call || call.status !== 'ringing') {
          setIncomingCall(null);
          activeCallIdRef.current = null;
          stopRingtone();
          return;
        }
        const callId = String(call._id);
        const category = call.type === 'video' ? 'videoCalls' : 'voiceCalls';
        const isTargetChatOpen = document.visibilityState === 'visible' &&
          window.location.pathname === `/chat/${encodeURIComponent(call.roomId)}`;
        if (isTargetChatOpen) {
          setIncomingCall(null);
          // ChatCallPanel owns the visible in-chat controls, but the global monitor
          // must keep ringing until the recipient accepts or rejects the call.
          activeCallIdRef.current = callId;
          if (preferencesRef.current.events[category] && preferencesRef.current.channels.callRingtone) {
            startRingtone();
          } else {
            stopRingtone();
          }
          return;
        }
        setIncomingCall(call);
        if (activeCallIdRef.current !== callId) {
          activeCallIdRef.current = callId;
          notify(
            call.type === 'video' ? 'Incoming video call' : 'Incoming voice call',
            `${call.callerName || 'Someone'} is calling you`,
            category,
            `/chat/${encodeURIComponent(call.roomId)}`
          );
        }
        if (preferencesRef.current.events[category] && preferencesRef.current.channels.callRingtone) {
          startRingtone();
        } else {
          stopRingtone();
        }
      } catch (_) {
        // A transient network failure must not interrupt the rest of the app.
      } finally {
        callInFlight = false;
      }
    };

    const checkActivity = async () => {
      if (activityInFlight || document.visibilityState !== 'visible') return;
      activityInFlight = true;
      try {
        const [notifications, conversations] = await Promise.all([
          apiClient.get('/notifications').catch(() => []),
          apiClient.get('/chat/conversations').catch(() => null)
        ]);
        if (!mounted) return;

        if (Array.isArray(notifications)) {
          const currentIds = new Set();
          notifications.forEach(item => {
            const id = String(item._id || item.id || `${item.type}-${item.senderUid}-${item.createdAt}`);
            currentIds.add(id);
            if (!initializedRef.current.notifications) return;
            if (seenNotificationsRef.current.has(id)) return;
            const category = categoryForNotification(item.type, item);
            if (category) {
              const label = item.type === 'match' ? 'New match'
                : item.type === 'superlike' ? 'New Super Like'
                  : item.type === 'like' ? 'New like'
                    : item.type === 'missed_call' ? (item.callType === 'video' ? 'Missed video call' : 'Missed voice call')
                      : 'New activity';
              const destination = item.roomId
                ? `/chat/${encodeURIComponent(item.roomId)}`
                : item.type === 'match' ? '/matches' : '/likes';
              const message = item.type === 'missed_call' ? 'You missed a call.' : 'You have a new update.';
              notify(label, message, category, destination);
            }
          });
          currentIds.forEach(id => seenNotificationsRef.current.add(id));
          if (seenNotificationsRef.current.size > 500) {
            seenNotificationsRef.current = new Set([...seenNotificationsRef.current].slice(-250));
          }
          initializedRef.current.notifications = true;
        }

        if (Array.isArray(conversations)) {
          window.dispatchEvent(new CustomEvent('dating-app-conversations-updated', { detail: conversations }));
          const currentIds = new Set();
          conversations.forEach(conversation => {
            const message = conversation.lastMessage;
            if (!message || message.senderUid === user.uid) return;
            const id = String(message._id || message.id || `${conversation.roomId}-${message.timestamp}`);
            currentIds.add(id);
            if (!initializedRef.current.messages || seenMessagesRef.current.has(id)) return;
            notify(
              'New message',
              `${conversation.otherUser?.name || 'Someone'} sent you a message.`,
              'newMessages',
              `/chat/${encodeURIComponent(conversation.roomId)}`
            );
          });
          currentIds.forEach(id => seenMessagesRef.current.add(id));
          if (seenMessagesRef.current.size > 500) {
            seenMessagesRef.current = new Set([...seenMessagesRef.current].slice(-250));
          }
          initializedRef.current.messages = true;
        }
      } catch (_) {
        // Continue polling after transient API errors.
      } finally {
        activityInFlight = false;
      }
    };

    loadPreferences().finally(() => {
      if (!mounted) return;
      checkCall();
      checkActivity();
    });
    // Calls remain responsive with a 15-second check. Notifications and inbox
    // data are lower urgency, so share a 90-second refresh cycle instead of
    // downloading both collections every 30 seconds.
    callTimer = window.setInterval(checkCall, 15000);
    activityTimer = window.setInterval(checkActivity, 90000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkCall();
        checkActivity();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted = false;
      if (callTimer) window.clearInterval(callTimer);
      if (activityTimer) window.clearInterval(activityTimer);
      stopRingtone();
      window.removeEventListener('pointerdown', unlockOnFirstGesture);
      window.removeEventListener('keydown', unlockOnFirstGesture);
      window.removeEventListener('dating-app-notification-preferences-updated', onPreferencesUpdated);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const context = audioRef.current.context;
      if (context && context.state !== 'closed') context.close().catch(() => {});
      audioRef.current.context = null;
    };
  }, [user?.uid]);

  return incomingCall ? (
    <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-gradient-to-b from-emerald-950 via-slate-950 to-slate-950 px-5 py-8 text-white" role="dialog" aria-modal="true" aria-label={incomingCall.type === 'video' ? 'Incoming video call' : 'Incoming voice call'}>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-6 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white/15 bg-slate-700 text-4xl font-semibold shadow-2xl">
          {incomingCall.callerPhoto || incomingCall.callerAvatar
            ? <img src={incomingCall.callerPhoto || incomingCall.callerAvatar} alt="" className="h-full w-full object-cover" />
            : (incomingCall.callerName || '♡').trim().charAt(0).toUpperCase()}
        </div>
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">Incoming {incomingCall.type === 'video' ? 'video' : 'voice'} call</p>
        <h2 className="text-3xl font-semibold tracking-tight">{incomingCall.callerName || 'Someone is calling'}</h2>
        <p className="mt-3 text-sm text-slate-300">Calling you…</p>
        {incomingCall.type === 'video' && <p className="mt-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-300">Video call · Camera starts when you answer</p>}
        <div className="mt-16 flex w-full items-start justify-center gap-14">
          <button type="button" onClick={rejectIncomingCall} disabled={callActionBusy} className="flex min-w-24 flex-col items-center gap-3 disabled:opacity-50" aria-label="Reject incoming call">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 shadow-lg transition hover:bg-rose-500 active:scale-95">
              <svg viewBox="0 0 24 24" className="h-7 w-7 rotate-[135deg]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg>
            </span>
            <span className="text-sm font-semibold">{callActionBusy ? 'Please wait…' : 'Decline'}</span>
          </button>
          <button type="button" onClick={answerIncomingCall} disabled={callActionBusy} className="flex min-w-24 flex-col items-center gap-3 disabled:opacity-50" aria-label="Answer incoming call">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:bg-emerald-400 active:scale-95">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg>
            </span>
            <span className="text-sm font-semibold">Answer</span>
          </button>
        </div>
        {callActionError && <p className="mt-6 rounded-xl bg-rose-950/70 px-4 py-3 text-sm text-rose-200" role="alert">{callActionError}</p>}
      </div>
    </div>
  ) : null;
}
