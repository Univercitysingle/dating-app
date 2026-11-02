import { useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';

export default function IncomingCallMonitor() {
  const { user } = useAuth();
  const lastCallIdRef = useRef(null);
  const ringtoneRef = useRef({ context: null, timer: null });

  useEffect(() => {
    let mounted = true;
    let timer = null;
    let requestInFlight = false;

    const stopRingtone = () => {
      if (ringtoneRef.current.timer) {
        window.clearInterval(ringtoneRef.current.timer);
        ringtoneRef.current.timer = null;
      }
    };

    const startRingtone = () => {
      if (ringtoneRef.current.timer || window.localStorage.getItem('dating-app-call-alerts') !== 'enabled') return;
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      try {
        const context = ringtoneRef.current.context || new AudioContextClass();
        ringtoneRef.current.context = context;
        if (context.state === 'suspended') context.resume().catch(() => {});
        const ring = () => {
          if (context.state !== 'running') return;
          const now = context.currentTime;
          [0, 0.3].forEach(offset => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, now + offset);
            oscillator.frequency.setValueAtTime(660, now + offset + 0.18);
            gain.gain.setValueAtTime(0.0001, now + offset);
            gain.gain.exponentialRampToValueAtTime(0.14, now + offset + 0.025);
            gain.gain.setValueAtTime(0.14, now + offset + 0.14);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start(now + offset);
            oscillator.stop(now + offset + 0.21);
            oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          });
        };
        ring();
        ringtoneRef.current.timer = window.setInterval(ring, 1800);
      } catch (_) {
        // Audio can remain unavailable until the user enables it from a gesture.
      }
    };

    const checkIncomingCall = async () => {
      if (requestInFlight || !user?.uid) return;
      requestInFlight = true;
      try {
        const result = await apiClient.get('/calls/incoming');
        if (!mounted) return;
        const call = result?.call;
        if (!call || call.status !== 'ringing') {
          lastCallIdRef.current = null;
          stopRingtone();
          return;
        }

        const callId = String(call._id);
        const currentChatPath = `/chat/${encodeURIComponent(call.roomId)}`;
        const chatIsOpen = window.location.pathname === currentChatPath;
        if (chatIsOpen) {
          stopRingtone();
          return;
        }

        startRingtone();
        if (lastCallIdRef.current !== callId) {
          lastCallIdRef.current = callId;
          const callerName = call.callerName || 'Someone';
          const message = call.type === 'video' ? 'Incoming video call' : 'Incoming voice call';
          const openChat = () => window.location.assign(currentChatPath);

          if (document.visibilityState === 'visible') {
            toast.info(`${message} from ${callerName}. Select to open the conversation.`, {
              autoClose: false,
              closeOnClick: true,
              onClick: openChat
            });
          } else if ('Notification' in window && Notification.permission === 'granted') {
            try {
              const notification = new Notification(message, {
                body: `${callerName} is calling you`,
                tag: `incoming-call-${callId}`,
                requireInteraction: true
              });
              notification.onclick = () => {
                window.focus();
                openChat();
                notification.close();
              };
            } catch (_) {
              // Notifications may be blocked by the browser or operating system.
            }
          }
        }
      } catch (_) {
        // Keep the monitor quiet during temporary API or connectivity failures.
      } finally {
        requestInFlight = false;
      }
    };

    if (!user?.uid) {
      stopRingtone();
      return undefined;
    }

    checkIncomingCall();
    const run = async () => {
      await checkIncomingCall();
      if (mounted) timer = window.setTimeout(run, 2500);
    };
    timer = window.setTimeout(run, 2500);

    return () => {
      mounted = false;
      if (timer) window.clearTimeout(timer);
      stopRingtone();
    };
  }, [user?.uid]);

  return null;
}
