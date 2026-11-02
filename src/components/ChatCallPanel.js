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

  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => {
    setHeaderTarget(typeof document !== 'undefined' ? document.getElementById(`chat-call-actions-${roomId}`) : null);
  }, [roomId]);
  useEffect(() => { if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream; }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

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

  const sendCandidate = useCallback(async (callId, candidate) => {
    try {
      await apiClient.post('/calls/signal', { callId, candidate: candidate.toJSON ? candidate.toJSON() : candidate });
    } catch (err) {
      setError(messageFor(err, 'Unable to establish the call connection.'));
    }
  }, []);

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
      if (peer.connectionState === 'connected') setStatus(type === 'video' ? 'Video call connected' : 'Voice call connected');
      if (['failed', 'disconnected'].includes(peer.connectionState)) setStatus('Connection interrupted. Check your network.');
    };
    return peer;
  }, [sendCandidate]);

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
    callActionInProgressRef.current = false;
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
          if (!peerRef.current || !remoteReadyRef.current) queuedRemoteRef.current.push(signal.candidate);
          else {
            try { await peerRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)); } catch (_) { /* Ignore stale ICE candidates. */ }
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
  }, [roomId, currentUser?.uid, cleanupMedia, setRemoteDescription]);

  useEffect(() => () => cleanupMedia(), [cleanupMedia]);

  const toggleMute = () => {
    (localStreamRef.current?.getAudioTracks() || []).forEach(track => { track.enabled = muted; });
    setMuted(value => !value);
  };
  const toggleCamera = () => {
    (localStreamRef.current?.getVideoTracks() || []).forEach(track => { track.enabled = cameraOff; });
    setCameraOff(value => !value);
  };

  const incoming = call && call.receiverUid === currentUser?.uid && call.status === 'ringing';
  const active = call && ['ringing', 'accepted'].includes(call.status);
  const videoCall = call?.type === 'video';

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
              <button type="button" onClick={acceptCall} className="call-action call-action-voice call-icon-button" aria-label="Accept incoming call" title="Accept call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
              </button>
              <button type="button" onClick={() => finishCall('decline')} className="call-action call-action-danger call-icon-button" aria-label="Decline incoming call" title="Decline call">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
              </button>
            </>}
            {active && !incoming && <button type="button" onClick={() => finishCall('end')} className="call-action call-action-danger call-icon-button" aria-label="End call" title="End call">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 14.5c4.5-4 11.5-4 16 0l-2.5 4-4-2-1-2h-3l-1 2-4 2z"/></svg>
            </button>}
          </div>,
      headerTarget
    )}

    {status && <p className="mt-2 text-sm text-gray-600" role="status">{status}</p>}
    {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    {active && <div className="mt-3 grid gap-3">
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
