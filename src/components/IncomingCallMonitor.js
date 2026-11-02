import { useEffect, useRef } from 'react';
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
        toast.info(
          <div className="min-w-0">
            <div className="font-semibold">{title}</div>
            <div className="mt-1 text-sm">{body}</div>
            {category === 'voiceCalls' || category === 'videoCalls' ? (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  onClick={event => {
                    event.stopPropagation();
                    if (url) window.location.assign(url);
                  }}
                >Answer</button>
                <button
                  type="button"
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                  onClick={async event => {
                    event.stopPropagation();
                    try {
                      const incoming = await apiClient.get('/calls/incoming');
                      if (incoming?.call?._id) {
                        await apiClient.post('/calls/action', {
                          callId: String(incoming.call._id),
                          action: 'decline'
                        });
                      }
                      closeToast();
                    } catch (_) {
                      toast.error('Could not reject the call. Open the chat and try again.');
                    }
                  }}
                >Reject</button>
              </div>
            ) : null}
          </div>,
          { autoClose: category === 'voiceCalls' || category === 'videoCalls' ? false : 7000, closeOnClick: false }
        );
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
        const result = await apiClient.get('/calls/incoming');
        if (!mounted) return;
        const call = result?.call;
        if (!call || call.status !== 'ringing') {
          activeCallIdRef.current = null;
          stopRingtone();
          return;
        }
        const callId = String(call._id);
        const category = call.type === 'video' ? 'videoCalls' : 'voiceCalls';
        const isTargetChatOpen = window.location.pathname === `/chat/${encodeURIComponent(call.roomId)}`;
        if (isTargetChatOpen) {
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
      if (activityInFlight) return;
      activityInFlight = true;
      try {
        const [notifications, conversations] = await Promise.all([
          apiClient.get('/notifications').catch(() => []),
          apiClient.get('/chat/conversations').catch(() => [])
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
    callTimer = window.setInterval(checkCall, 2500);
    activityTimer = window.setInterval(checkActivity, 10000);

    return () => {
      mounted = false;
      if (callTimer) window.clearInterval(callTimer);
      if (activityTimer) window.clearInterval(activityTimer);
      stopRingtone();
      window.removeEventListener('pointerdown', unlockOnFirstGesture);
      window.removeEventListener('keydown', unlockOnFirstGesture);
      window.removeEventListener('dating-app-notification-preferences-updated', onPreferencesUpdated);
      const context = audioRef.current.context;
      if (context && context.state !== 'closed') context.close().catch(() => {});
      audioRef.current.context = null;
    };
  }, [user?.uid]);

  return null;
}
