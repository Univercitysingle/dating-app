import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import apiClient from '../api/apiClient';
import { getCallIceConfig } from '../utils/videoRoomIce';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const messageFor = (error, fallback) => error?.data?.error || error?.data?.message || error?.message || fallback;

export default function ChatCallPanel({ roomId, currentUser, otherUser }) {
  const [call, setCall] = useState(null);
  const [headerTarget, setHeaderTarget] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState(0);
  const [callAlertsEnabled, setCallAlertsEnabled] = useState(true);
  const [callAlertEventEnabled, setCallAlertEventEnabled] = useState(true);

  useEffect(() => {
    let active = true;
    const apply = preferences => {
      const channels = preferences?.channels || {};
      const events = preferences?.events || {};
      setCallAlertsEnabled(channels.callRingtone !== false);
      setCallAlertEventEnabled(call?.type === 'video' ? events.videoCalls !== false : events.voiceCalls !== false);
    };
    apiClient.get('/notification-preferences').then(value => {
      if (active) apply(value);
    }).catch(() => {});
    const onUpdate = event => { if (active) apply(event.detail); };
    window.addEventListener('dating-app-notification-preferences-updated', onUpdate);
    return () => {
      active = false;
      window.removeEventListener('dating-app-notification-preferences-updated', onUpdate);
    };
  }, [call?.type]);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const queuedLocalRef = useRef([]);
  const queuedRemoteRef = useRef([]);
  const remoteReadyRef = useRef(false);
  const pollingRef = useRef(false);
  const callActionInProgressRef = useRef(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const ringtoneTimerRef = useRef(null);
  const ringtoneContextRef = useRef(null);
  const notifiedCallIdRef = useRef(null);

  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => {
    setHeaderTarget(typeof document !== 'undefined' ? document.getElementById(`chat-call-actions-${roomId}`) : null);
  }, [roomId]);
  useEffect(() => { if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream; }, [localStream, call?.status]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream, call?.status]);

  useEffect(() => {
    if (call?.status !== 'accepted' || !call.connectedAt) {
      setCallDuration(0);
      return undefined;
    }
    const updateDuration = () => {
      const startedAt = new Date(call.connectedAt).getTime();
      setCallDuration(Number.isFinite(startedAt) ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0);
    };
    updateDuration();
    const interval = window.setInterval(updateDuration, 1000);
    return () => window.clearInterval(interval);
  }, [call?.status, call?.connectedAt]);

  useEffect(() => {
    if (call?.status !== 'accepted' || !peerRef.current) {
      setConnectionQuality(0);
      return undefined;
    }
    let cancelled = false;
    const readConnectionQuality = async () => {
      const peer = peerRef.current;
      if (!peer || peer.connectionState !== 'connected') return;
      try {
        const stats = await peer.getStats();
        let packetsReceived = 0;
        let packetsLost = 0;
        let roundTripTime = null;
        stats.forEach(report => {
          if (report.type === 'inbound-rtp' && !report.isRemote) {
            packetsReceived += report.packetsReceived || 0;
            packetsLost += Math.max(0, report.packetsLost || 0);
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded' &&
              (report.nominated || report.selected)) {
            if (typeof report.currentRoundTripTime === 'number') roundTripTime = report.currentRoundTripTime;
          }
        });
        const totalPackets = packetsReceived + packetsLost;
        const lossRate = totalPackets ? packetsLost / totalPackets : 0;
        let quality = 3;
        if (roundTripTime !== null && roundTripTime < 0.15 && lossRate < 0.02) quality = 5;
        else if ((roundTripTime === null || roundTripTime < 0.25) && lossRate < 0.04) quality = 4;
        else if ((roundTripTime !== null && roundTripTime > 0.5) || lossRate > 0.1) quality = 1;
        else if ((roundTripTime !== null && roundTripTime > 0.3) || lossRate > 0.05) quality = 2;
        if (!cancelled) setConnectionQuality(quality);
      } catch (_) {
        if (!cancelled) setConnectionQuality(0);
      }
    };
    readConnectionQuality();
    const interval = window.setInterval(readConnectionQuality, 2000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [call?.status, call?._id]);

  useEffect(() => {
    if (!localStream) {
      setAudioLevel(0);
      return undefined;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return undefined;
    let audioContext;
    let source;
    let analyser;
    let frameId;
    let stopped = false;
    try {
      audioContext = new AudioContextClass();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source = audioContext.createMediaStreamSource(localStream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      const measure = () => {
        if (stopped) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const sample of samples) {
          const normalized = (sample - 128) / 128;
          sum += normalized * normalized;
        }
        setAudioLevel(Math.min(1, Math.sqrt(sum / samples.length) * 4));
        frameId = window.requestAnimationFrame(measure);
      };
      measure();
    } catch (_) {
      setAudioLevel(0);
    }
    return () => {
      stopped = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      try { source?.disconnect(); analyser?.disconnect(); } catch (_) { /* Media already closed. */ }
      if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
    };
  }, [localStream]);

  const formatDuration = seconds => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  const stopRingtone = useCallback(() => {
    if (ringtoneTimerRef.current) {
      window.clearInterval(ringtoneTimerRef.current);
      ringtoneTimerRef.current = null;
    }
  }, []);

  const playRingtone = useCallback(() => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    try {
      const context = ringtoneContextRef.current || new AudioContextClass();
      ringtoneContextRef.current = context;
      if (context.state === 'suspended') context.resume().catch(() => {});
      const playPair = () => {
        if (context.state !== 'running') return;
        const now = context.currentTime;
        [0, 0.28].forEach(offset => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, now + offset);
          oscillator.frequency.setValueAtTime(660, now + offset + 0.18);
          gain.gain.setValueAtTime(0.0001, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.025);
          gain.gain.setValueAtTime(0.16, now + offset + 0.14);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.2);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(now + offset);
          oscillator.stop(now + offset + 0.21);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        });
      };
      stopRingtone();
      playPair();
      ringtoneTimerRef.current = window.setInterval(playPair, 1800);
    } catch (_) {
      // Browser audio policy or unavailable audio hardware can block the ringtone.
    }
  }, [stopRingtone]);

  const cleanupMedia = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.close();
      peerRef.current = null;
    }
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCameraOff(false);
    remoteReadyRef.current = false;
    queuedLocalRef.current = [];
    queuedRemoteRef.current = [];
  }, []);

  const reconnectAttemptsRef = useRef(0);
  const reconnectingRef = useRef(false);
  const reconnectTimerRef = useRef(null);
  const [reconnecting, setReconnecting] = useState(false);

  const sendCandidate = useCallback(async (callId, candidate) => {
    try {
      await apiClient.post('/calls/signal', { callId, candidate: candidate.toJSON ? candidate.toJSON() : candidate });
    } catch (err) {
      setError(messageFor(err, 'Unable to establish the call connection.'));
    }
  }, []);

  const sendDescription = useCallback(async (callId, description) => {
    try {
      await apiClient.post('/calls/signal', { callId, description: { type: description.type, sdp: description.sdp } });
    } catch (err) {
      setError(messageFor(err, 'Unable to restore the call connection.'));
    }
  }, []);

  const restartConnection = useCallback(async () => {
    const peer = peerRef.current;
    const activeCall = callRef.current;
    if (!peer || !activeCall || activeCall.status !== 'accepted' ||
        activeCall.callerUid !== currentUser?.uid || reconnectingRef.current ||
        !navigator.onLine || reconnectAttemptsRef.current >= 3) return;
    reconnectingRef.current = true;
    setReconnecting(true);
    setStatus('Network interrupted. Reconnecting…');
    try {
      reconnectAttemptsRef.current += 1;
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      await sendDescription(String(activeCall._id), peer.localDescription);
    } catch (err) {
      setError(messageFor(err, 'Automatic reconnection failed. Please check your network.'));
      reconnectingRef.current = false;
      setReconnecting(false);
    }
  }, [currentUser?.uid, sendDescription]);

  const makePeer = useCallback(async type => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === 'video' });
    localStreamRef.current = stream;
    setLocalStream(stream);
    const iceConfig = await getCallIceConfig();
    const peer = new RTCPeerConnection({
      iceServers: Array.isArray(iceConfig?.iceServers) && iceConfig.iceServers.length ? iceConfig.iceServers : ICE_SERVERS,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 2,
    });
    peerRef.current = peer;
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peer.ontrack = event => { if (event.streams?.[0]) setRemoteStream(event.streams[0]); };
    peer.onicecandidate = event => {
      if (!event.candidate) return;
      const id = callRef.current?._id;
      if (id) sendCandidate(String(id), event.candidate);
      else queuedLocalRef.current.push(event.candidate);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        reconnectAttemptsRef.current = 0;
        reconnectingRef.current = false;
        setReconnecting(false);
        setError('');
        setStatus(type === 'video' ? 'Video call connected' : 'Voice call connected');
      } else if (peer.connectionState === 'disconnected' || peer.connectionState === 'failed') {
        setStatus('Connection lost. Trying to reconnect…');
        setReconnecting(true);
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') restartConnection();
        }, peer.connectionState === 'failed' ? 500 : 1800);
      } else if (peer.connectionState === 'connecting') {
        setStatus('Reconnecting…');
        setReconnecting(true);
      }
    };
    return peer;
  }, [sendCandidate, restartConnection]);

  const flushLocalCandidates = useCallback(async callId => {
    for (const candidate of queuedLocalRef.current.splice(0)) await sendCandidate(String(callId), candidate);
  }, [sendCandidate]);

  const setRemoteDescription = useCallback(async description => {
    const peer = peerRef.current;
    if (!peer || !description || remoteReadyRef.current) return;
    await peer.setRemoteDescription(new RTCSessionDescription(description));
    remoteReadyRef.current = true;
    for (const candidate of queuedRemoteRef.current.splice(0)) {
      try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) { /* Ignore stale ICE candidates. */ }
    }
  }, []);

  const startCall = async type => {
    if (callActionInProgressRef.current || callRef.current) return;
    callActionInProgressRef.current = true;
    setError('');
    setStatus('Requesting microphone and camera access…');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        throw new Error('Calls require a supported browser and HTTPS.');
      }
      const peer = await makePeer(type);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const result = await apiClient.post('/calls/start', {
        roomId, receiverUid: otherUser.uid, type,
        offer: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
      });
      callRef.current = result;
      setCall(result);
      setStatus('Calling… waiting for the other user');
      await flushLocalCandidates(result._id);
    } catch (err) {
      cleanupMedia();
      setStatus('');
      setError(messageFor(err, 'Could not start the call. Check permissions and try again.'));
    } finally {
      callActionInProgressRef.current = false;
    }
  };

  const acceptCall = async () => {
    if (callActionInProgressRef.current) return;
    callActionInProgressRef.current = true;
    const incoming = callRef.current;
    if (!incoming || incoming.receiverUid !== currentUser?.uid) {
      callActionInProgressRef.current = false;
      return;
    }
    setError('');
    setStatus('Connecting…');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        throw new Error('Calls require a supported browser and HTTPS.');
      }
      const peer = await makePeer(incoming.type);
      await setRemoteDescription(incoming.offer);
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      const result = await apiClient.post('/calls/action', {
        callId: String(incoming._id), action: 'accept',
        answer: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
      });
      const updated = result.call || { ...incoming, status: 'accepted', answer };
      callRef.current = updated;
      setCall(updated);
      setStatus('Connecting…');
      await flushLocalCandidates(incoming._id);
    } catch (err) {
      cleanupMedia();
      setError(messageFor(err, 'Could not accept the call.'));
      setStatus('');
    } finally {
      callActionInProgressRef.current = false;
    }
  };

  const finishCall = async action => {
    if (callActionInProgressRef.current) return;
    callActionInProgressRef.current = true;
    try {
      const active = callRef.current;
      if (active?._id) {
        try {
          await apiClient.post('/calls/action', { callId: String(active._id), action });
        } catch (err) {
          // Keep the call and media alive if the server did not confirm the end
          // action. Clearing the UI here can leave a zombie active session in DB.
          setError(messageFor(err, 'Could not update the call status. Please retry.'));
          return;
        }
      }
      cleanupMedia();
      callRef.current = null;
      setCall(null);
      setStatus(action === 'decline' ? 'Call declined' : 'Call ended');
    } finally {
      callActionInProgressRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (pollingRef.current || !currentUser?.uid || !roomId) return;
      pollingRef.current = true;
      try {
        const result = await apiClient.get('/calls/poll', { params: { roomId } });
        if (!mounted) return;
        const next = result?.call || null;
        if (!next || !['ringing', 'accepted'].includes(next.status)) {
          if (callRef.current) {
            cleanupMedia();
            callRef.current = null;
            setCall(null);
            setStatus('Call ended');
          }
          return;
        }
        const current = callRef.current;
        if (!current || String(current._id) !== String(next._id)) {
          if (current) cleanupMedia();
          seenSignalsRef.current = new Set();
          callRef.current = next;
          setCall(next);
          setStatus(next.callerUid === currentUser.uid ? 'Calling…' : 'Incoming call');
        } else {
          callRef.current = next;
          setCall(next);
        }
        if (next.callerUid === currentUser.uid && next.answer && peerRef.current) await setRemoteDescription(next.answer);
        for (const signal of result.signals || []) {
          if (!signal?.signalId || seenSignalsRef.current.has(signal.signalId)) continue;
          seenSignalsRef.current.add(signal.signalId);
          const peer = peerRef.current;
          if (signal.description && peer) {
            try {
              await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
              remoteReadyRef.current = true;
              if (signal.description.type === 'offer') {
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                await sendDescription(String(next._id), peer.localDescription);
              }
              for (const candidate of queuedRemoteRef.current.splice(0)) {
                try { await peer.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) { /* Ignore stale ICE candidates. */ }
              }
            } catch (_) {
              setStatus('Unable to negotiate the restored connection. Retrying…');
            }
          } else if (signal.candidate) {
            if (!peer || !remoteReadyRef.current) queuedRemoteRef.current.push(signal.candidate);
            else {
              try { await peer.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (_) { /* Ignore stale ICE candidates. */ }
            }
          }
        }
      } catch (err) {
        if (mounted && err?.status && err.status !== 401) setError(messageFor(err, 'Call signaling is temporarily unavailable.'));
      } finally {
        pollingRef.current = false;
      }
    };
    let pollTimer = null;
    const runPoll = async () => {
      await poll();
      if (!mounted) return;
      // Poll more frequently while ringing or connected, but reduce idle chat
      // traffic. The old fixed 1.2s interval generated 50 requests per minute
      // for every open chat, even when neither user was calling.
      const activeCall = callRef.current && ["ringing", "accepted"].includes(callRef.current.status);
      pollTimer = window.setTimeout(runPoll, activeCall ? 1200 : 3000);
    };
    runPoll();
    return () => {
      mounted = false;
      if (pollTimer) window.clearTimeout(pollTimer);
    };
  }, [roomId, currentUser?.uid, cleanupMedia, setRemoteDescription, sendDescription]);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  const toggleMute = () => {
    (localStreamRef.current?.getAudioTracks() || []).forEach(track => { track.enabled = muted; });
    setMuted(value => !value);
  };
  const toggleCamera = () => {
    (localStreamRef.current?.getVideoTracks() || []).forEach(track => { track.enabled = cameraOff; });
    setCameraOff(value => !value);
  };

  useEffect(() => {
    const onOnline = () => {
      if (callRef.current?.status === 'accepted') {
        reconnectAttemptsRef.current = 0;
        reconnectingRef.current = false;
        setReconnecting(true);
        restartConnection();
      }
    };
    const onOffline = () => {
      if (callRef.current?.status === 'accepted') {
        setReconnecting(true);
        setStatus('You are offline. Waiting for network…');
      }
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
    };
  }, [restartConnection]);

  const incoming = call && call.receiverUid === currentUser?.uid && call.status === 'ringing';
  const active = call && ['ringing', 'accepted'].includes(call.status);
  const videoCall = call?.type === 'video';

  useEffect(() => {
    if (!incoming || !call?._id) {
      stopRingtone();
      return undefined;
    }
    if (callAlertsEnabled && callAlertEventEnabled) playRingtone();
    else stopRingtone();
    notifiedCallIdRef.current = String(call._id);
    return undefined;
  }, [incoming, call?._id, call?.type, callAlertsEnabled, callAlertEventEnabled, playRingtone, stopRingtone]);

  useEffect(() => {
    if (!incoming) stopRingtone();
  }, [incoming, stopRingtone]);

  useEffect(() => () => {
    stopRingtone();
    const context = ringtoneContextRef.current;
    if (context && context.state !== 'closed') context.close().catch(() => {});
    ringtoneContextRef.current = null;
  }, [stopRingtone]);

  return <section className="chat-call-panel" aria-label="Voice and video calls">
    {headerTarget && createPortal(
          <div className="chat-header-call-actions flex items-center gap-2">
            {!active && <>
              <button type="button" onClick={() => startCall('audio')} className="call-action call-action-voice call-icon-button" aria-label="Start voice call" title="Start voice call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3a14 14 0 0 1-5-5l3-2-2-5z"/></svg>
              </button>
              <button type="button" onClick={() => startCall('video')} className="call-action call-action-video call-icon-button" aria-label="Start video call" title="Start video call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/></svg>
              </button>
            </>}
            {incoming && <>
              <button type="button" onClick={acceptCall} disabled={callActionInProgressRef.current} className="call-action call-action-voice inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 font-semibold disabled:cursor-wait disabled:opacity-60" aria-label="Answer incoming call" title="Answer call">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
                <span>Answer</span>
              </button>
              <button type="button" onClick={() => finishCall('decline')} disabled={callActionInProgressRef.current} className="call-action call-action-danger inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 font-semibold disabled:cursor-wait disabled:opacity-60" aria-label="Reject incoming call" title="Reject call">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
                <span>Reject</span>
              </button>
            </>}
            {active && !incoming && <button type="button" onClick={() => finishCall('end')} className="call-action call-action-danger call-icon-button" aria-label="End call" title="End call">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 14.5c4.5-4 11.5-4 16 0l-2.5 4-4-2-1-2h-3l-1 2-4 2z"/></svg>
            </button>}
          </div>,
      headerTarget
    )}

    {incoming && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 px-5 py-8 text-white" role="dialog" aria-modal="true" aria-label={videoCall ? 'Incoming video call' : 'Incoming voice call'}>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <div className="mb-5 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-white/15 bg-slate-700 text-4xl font-semibold shadow-2xl">
          {otherUser?.photos?.[0]?.url
            ? <img src={otherUser.photos[0].url} alt="" className="h-full w-full object-cover" />
            : (otherUser?.name || '♡').trim().charAt(0).toUpperCase()}
        </div>
        <p className="mb-2 text-sm font-medium uppercase tracking-[0.22em] text-emerald-300">Incoming {videoCall ? 'video' : 'voice'} call</p>
        <h2 className="text-3xl font-semibold tracking-tight">{otherUser?.name || 'Someone is calling'}</h2>
        <p className="mt-3 text-sm text-slate-300">Calling you…</p>
        {videoCall && <div className="mt-4 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs text-slate-300">Camera will start when you answer</div>}
        <div className="mt-16 flex w-full items-start justify-center gap-12">
          <button type="button" onClick={() => finishCall('decline')} disabled={callActionInProgressRef.current} className="flex min-w-24 flex-col items-center gap-3 disabled:opacity-50" aria-label="Reject call">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 shadow-lg transition hover:bg-rose-500 active:scale-95">
              <svg viewBox="0 0 24 24" className="h-7 w-7 rotate-[135deg]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg>
            </span>
            <span className="text-sm font-semibold">Decline</span>
          </button>
          <button type="button" onClick={acceptCall} disabled={callActionInProgressRef.current} className="flex min-w-24 flex-col items-center gap-3 disabled:opacity-50" aria-label="Answer call">
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 shadow-lg transition hover:bg-emerald-400 active:scale-95">
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg>
            </span>
            <span className="text-sm font-semibold">Answer</span>
          </button>
        </div>
        {error && <p className="mt-8 rounded-xl bg-rose-950/70 px-4 py-3 text-sm text-rose-200" role="alert">{error}</p>}
        {status && status !== 'Incoming call' && <p className="mt-3 text-sm text-slate-300" role="status">{status}</p>}
      </div>
    </div>}
    {status && <p className="mt-2 text-sm text-gray-600" role="status">{status}</p>}
    {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    {active && videoCall && call?.status === "accepted" && <div className="fixed inset-0 z-[10500] h-[100dvh] min-h-0 overflow-hidden bg-[#07110e] text-white" style={{ touchAction: "manipulation" }} role="dialog" aria-modal="true" aria-label="Video call">
      <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full bg-[#07110e] object-cover" />
      {!remoteStream && <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-slate-900 to-[#07110e] px-6 text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-white/10 text-3xl font-semibold">{otherUser?.photos?.[0]?.url ? <img src={otherUser.photos[0].url} alt="" className="h-full w-full object-cover" /> : (otherUser?.name || "♡").trim().charAt(0).toUpperCase()}</div>
        <p className="text-lg font-semibold">{otherUser?.name || "Video call"}</p><p className="text-sm text-white/70">Connecting video…</p>
      </div>}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-black/65 to-transparent" />
      {reconnecting && <div className="absolute left-1/2 top-24 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/65 px-4 py-2 text-xs font-medium text-white shadow-lg backdrop-blur-md" role="status">
        <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />{navigator.onLine ? 'Reconnecting call…' : 'Waiting for network…'}
      </div>}
      <div className="absolute left-3 right-3 flex items-start justify-between gap-2 sm:left-7 sm:right-7 sm:gap-3" style={{ top: "max(1rem, env(safe-area-inset-top))" }}>
        <div className="min-w-0 max-w-[72vw] rounded-2xl bg-black/35 px-3 py-2.5 backdrop-blur-md sm:max-w-[min(70vw,28rem)] sm:px-4 sm:py-3"><p className="truncate text-base font-semibold">{otherUser?.name || "Video call"}</p><p className="mt-1 text-sm text-white/75">{formatDuration(callDuration)} · {status || "Connected"}</p></div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-2 text-[10px] text-white/85 backdrop-blur-md sm:gap-2 sm:px-3 sm:text-xs" aria-label={connectionQuality ? `Network signal quality ${connectionQuality} of 5` : "Network signal quality unavailable"}>
          <span className="flex items-end gap-0.5" aria-hidden="true">{Array.from({length:5},(_,index)=><span key={index} className={connectionQuality >= index+1 ? "w-1 rounded-sm bg-emerald-400" : "w-1 rounded-sm bg-white/30"} style={{height: 6+index*2}} />)}</span><span>{connectionQuality ? "Signal" : "Connecting"}</span>
        </div>
      </div>
      <div className="absolute right-3 overflow-hidden rounded-2xl border border-white/35 bg-slate-800 shadow-2xl sm:right-7 sm:rounded-3xl" style={{ top: "max(6rem, calc(env(safe-area-inset-top) + 4.75rem))", width: "clamp(5.5rem, 28vw, 10rem)", height: "clamp(7rem, 23vh, 13rem)" }}>
        <video ref={localVideoRef} autoPlay muted playsInline className={cameraOff ? "h-full w-full object-cover opacity-0" : "h-full w-full object-cover"} />
        {cameraOff && <div className="absolute inset-0 flex items-center justify-center bg-slate-800 text-xs text-white/80">Camera off</div>}<span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-2 py-1 text-[10px] text-white">You</span>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/80 to-transparent" />
      <div className="absolute inset-x-0 flex flex-col items-center gap-3 px-3 sm:gap-4 sm:px-4" style={{ bottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        {error && <p className="max-w-md rounded-xl bg-rose-950/90 px-4 py-3 text-center text-sm text-rose-100" role="alert">{error}</p>}
        <div className="flex max-w-full items-center justify-center gap-2 rounded-[2rem] border border-white/15 bg-slate-950/75 px-3 py-3 shadow-2xl backdrop-blur-xl sm:gap-6 sm:px-7 sm:py-4">
          <button type="button" onClick={toggleMute} className={muted ? "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-md ring-2 ring-white/20 sm:h-14 sm:w-14" : "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/15 hover:bg-white/25 active:scale-95 sm:h-14 sm:w-14"} aria-label={muted ? "Unmute microphone" : "Mute microphone"} title={muted ? "Unmute microphone" : "Mute microphone"}>
            {muted ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 5.2 2M19 10v1a7 7 0 0 1-11.8 5M5 10v1a7 7 0 0 0 1 3.5M12 18v4m-4 0h8M3 3l18 18"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/></svg>}<span className="mt-1 text-[9px] font-medium">{muted ? "Unmute" : "Mute"}</span>
          </button>
          <button type="button" onClick={toggleCamera} className={cameraOff ? "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-white text-slate-900 shadow-md ring-2 ring-white/20 sm:h-14 sm:w-14" : "flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/15 hover:bg-white/25 active:scale-95 sm:h-14 sm:w-14"} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"} title={cameraOff ? "Turn camera on" : "Turn camera off"}>
            {cameraOff ? <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 3 18 18M10 6h5a2 2 0 0 1 2 2v1l4-2v10l-3-1.5M7 6.5A2 2 0 0 0 5 8v8a2 2 0 0 0 2 2h8"/></svg> : <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/></svg>}<span className="mt-1 text-[9px] font-medium">{cameraOff ? "Camera on" : "Camera off"}</span>
          </button>
          <button type="button" onClick={() => finishCall("end")} disabled={callActionInProgressRef.current} className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-full bg-rose-600 text-white shadow-lg transition hover:bg-rose-500 active:scale-95 disabled:opacity-50 sm:h-16 sm:w-20" aria-label="End video call" title="End call">
            <svg viewBox="0 0 24 24" className="h-6 w-6 rotate-[135deg]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 0 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg><span className="mt-1 text-[9px] font-semibold">End</span>
          </button>
        </div>
      </div>
    </div>}
    {active && !(videoCall && call?.status === "accepted") && <div className="mt-3 grid gap-3">
      {call?.status === 'accepted' && <div className="call-live-status flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
        <span className="call-live-dot" aria-hidden="true" />
        <span className="text-sm font-semibold text-gray-800">{formatDuration(callDuration)}</span>
        <span className="text-xs text-gray-500">{videoCall ? 'Video connected' : 'Voice connected'}</span>
        <div className="flex items-center gap-2" aria-label={connectionQuality ? `Network signal quality ${connectionQuality} of 5` : 'Network signal quality unavailable'}>
          <span className="text-xs text-gray-500">Signal</span>
          <div className="call-signal-meter" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => <span key={index} className={connectionQuality >= index + 1 ? 'is-active' : ''} />)}
          </div>
        </div>
        {localStream && <div className="ml-auto flex items-center gap-2" aria-label={`Microphone audio level ${Math.round(audioLevel * 100)} percent`}>
          <span className="text-xs text-gray-500">Mic</span>
          <div className="call-signal-meter" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <span key={index} className={audioLevel >= (index + 1) / 6 ? 'is-active' : ''} />)}
          </div>
        </div>}
      </div>}
      {!videoCall && <audio ref={remoteAudioRef} autoPlay />}
      {videoCall && <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative min-h-40 overflow-hidden rounded-xl bg-black">
          <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-40 max-h-72 w-full object-cover" />
          {!remoteStream && <span className="absolute inset-0 flex items-center justify-center text-sm text-white">Waiting for video…</span>}
        </div>
        <div className="min-h-32 overflow-hidden rounded-xl bg-black">
          <video ref={localVideoRef} autoPlay muted playsInline className="h-full min-h-32 max-h-56 w-full object-cover" />
        </div>
      </div>}
      {localStream && <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggleMute} className="call-utility-button" aria-label={muted ? 'Unmute microphone' : 'Mute microphone'} title={muted ? 'Unmute microphone' : 'Mute microphone'}>
          {muted ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 5.2 2M19 10v1a7 7 0 0 1-11.8 5M5 10v1a7 7 0 0 0 1 3.5M12 18v4m-4 0h8M3 3l18 18"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/></svg>}
        </button>
        {videoCall && <button type="button" onClick={toggleCamera} className="call-utility-button" aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'} title={cameraOff ? 'Turn camera on' : 'Turn camera off'}>
          {cameraOff ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m3 3 18 18M10 6h5a2 2 0 0 1 2 2v1l4-2v10l-3-1.5M7 6.5A2 2 0 0 0 5 8v8a2 2 0 0 0 2 2h8"/></svg> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/></svg>}
        </button>}
      </div>}
    </div>}
  </section>;
}
