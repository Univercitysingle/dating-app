import React, { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '../api/apiClient';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const messageFor = (error, fallback) => error?.data?.error || error?.data?.message || error?.message || fallback;

export default function ChatCallPanel({ roomId, currentUser, otherUser }) {
  const [call, setCall] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const callRef = useRef(null);
  const seenSignalsRef = useRef(new Set());
  const queuedLocalRef = useRef([]);
  const queuedRemoteRef = useRef([]);
  const remoteReadyRef = useRef(false);
  const pollingRef = useRef(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => { if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream; }, [localStream]);
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current && remoteStream) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

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
    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
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
    }
  };

  const acceptCall = async () => {
    const incoming = callRef.current;
    if (!incoming || incoming.receiverUid !== currentUser?.uid) return;
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
    }
  };

  const finishCall = async action => {
    const active = callRef.current;
    if (active?._id) {
      try { await apiClient.post('/calls/action', { callId: String(active._id), action }); }
      catch (err) { setError(messageFor(err, 'Could not update the call status.')); }
    }
    cleanupMedia();
    callRef.current = null;
    setCall(null);
    setStatus(action === 'decline' ? 'Call declined' : 'Call ended');
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
    poll();
    const interval = window.setInterval(poll, 1200);
    return () => { mounted = false; window.clearInterval(interval); };
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

  return <section className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-auto text-sm font-medium text-gray-700 dark:text-gray-200">Call {otherUser?.name || 'user'}</span>
      {!active && <>
        <button type="button" onClick={() => startCall('audio')} className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Voice call</button>
        <button type="button" onClick={() => startCall('video')} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">Video call</button>
      </>}
      {incoming && <>
        <button type="button" onClick={acceptCall} className="rounded-md bg-green-600 px-3 py-2 text-sm text-white">Accept</button>
        <button type="button" onClick={() => finishCall('decline')} className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">Decline</button>
      </>}
      {active && !incoming && <button type="button" onClick={() => finishCall('end')} className="rounded-md bg-red-600 px-3 py-2 text-sm text-white">Hang up</button>}
    </div>
    {status && <p className="mt-2 text-sm text-gray-600 dark:text-gray-300" role="status">{status}</p>}
    {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
    {active && <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {!videoCall && <audio ref={remoteAudioRef} autoPlay />}
      {videoCall && <div className="relative min-h-40 overflow-hidden rounded-lg bg-black">
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full min-h-40 max-h-72 w-full object-cover" />
        {!remoteStream && <span className="absolute inset-0 flex items-center justify-center text-sm text-white">Waiting for video…</span>}
      </div>}
      {videoCall && <div className="min-h-32 overflow-hidden rounded-lg bg-black">
        <video ref={localVideoRef} autoPlay muted playsInline className="h-full min-h-32 max-h-56 w-full object-cover" />
      </div>}
      {localStream && <div className="flex flex-wrap gap-2">
        <button type="button" onClick={toggleMute} className="rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:text-white">{muted ? 'Unmute microphone' : 'Mute microphone'}</button>
        {videoCall && <button type="button" onClick={toggleCamera} className="rounded-md border px-3 py-2 text-sm dark:border-gray-600 dark:text-white">{cameraOff ? 'Turn camera on' : 'Turn camera off'}</button>}
      </div>}
    </div>}
  </section>;
}
