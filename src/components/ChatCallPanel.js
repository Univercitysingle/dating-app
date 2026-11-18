import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import apiClient from '../api/apiClient';
import { getCallIceConfig } from '../utils/videoRoomIce';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];
const messageFor = (error, fallback) => error?.data?.error || error?.data?.message || error?.message || fallback;

export default function ChatCallPanel({ roomId, currentUser, otherUser }) {
  const firstOtherPhoto = otherUser?.photos?.[0];
  const otherPhotoUrl = typeof firstOtherPhoto === 'string' ? firstOtherPhoto : firstOtherPhoto?.url;
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
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('');
  const [audioDevicesOpen, setAudioDevicesOpen] = useState(false);
  const [videoMinimized, setVideoMinimized] = useState(false);
  const [localPreviewExpanded, setLocalPreviewExpanded] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState({ right: 16, bottom: 16 });
  const floatingDragRef = useRef(null);

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
  const cameraFacingRef = useRef('user');
  const videoBitrateRef = useRef(0);

  // A callback ref attaches the local stream when the video element actually
  // mounts. This avoids depending on effect timing when the call overlay is
  // created after getUserMedia has already resolved.
  const attachLocalVideo = useCallback(element => {
    localVideoRef.current = element;
    if (!element) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    if (element.srcObject !== stream) element.srcObject = stream;
    const playResult = element.play?.();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch(() => {
        // Autoplay may be blocked until the user interacts with the page.
      });
    }
  }, []);

  useEffect(() => { callRef.current = call; }, [call]);
  useEffect(() => { setVideoMinimized(false); setLocalPreviewExpanded(false); setAudioDevicesOpen(false); setFloatingPosition({ right: 16, bottom: 16 }); floatingDragRef.current = null; }, [call?.id, call?.status]);

  // Keep the compact call window inside the visible viewport while allowing
  // the user to drag it by its title bar on touchscreens and desktop browsers.
  useEffect(() => {
    const onPointerMove = event => {
      const drag = floatingDragRef.current;
      if (!drag) return;
      const right = Math.max(8, Math.min(window.innerWidth - 120, drag.right - (event.clientX - drag.x)));
      const bottom = Math.max(8, Math.min(window.innerHeight - 90, drag.bottom + (event.clientY - drag.y)));
      setFloatingPosition({ right, bottom });
    };
    const stopDragging = () => { floatingDragRef.current = null; };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);
  useEffect(() => {
    setHeaderTarget(typeof document !== 'undefined' ? document.getElementById(`chat-call-actions-${roomId}`) : null);
  }, [roomId]);
  useEffect(() => {
    const element = localVideoRef.current;
    if (!element || !localStream) return;
    if (element.srcObject !== localStream) element.srcObject = localStream;
    const playResult = element.play?.();
    if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {});
  }, [localStream, call?.status]);
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
      videoBitrateRef.current = 0;
      return undefined;
    }
    let cancelled = false;
    let pendingQuality = 0;
    let pendingSamples = 0;
    const qualityProfiles = {
      1: { bitrate: 160000, frameRate: 10, scale: 4 },
      2: { bitrate: 300000, frameRate: 15, scale: 3 },
      3: { bitrate: 550000, frameRate: 20, scale: 2 },
      4: { bitrate: 950000, frameRate: 24, scale: 1.5 },
      5: { bitrate: 1400000, frameRate: 30, scale: 1 }
    };
    const readConnectionQuality = async () => {
      const peer = peerRef.current;
      if (!peer || peer.connectionState !== 'connected') return;
      try {
        const stats = await peer.getStats();
        let roundTripTime = null;
        let availableOutgoingBitrate = null;
        let packetLoss = null;
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded' &&
              (report.nominated || report.selected)) {
            if (typeof report.currentRoundTripTime === 'number') roundTripTime = report.currentRoundTripTime;
            if (typeof report.availableOutgoingBitrate === 'number') {
              availableOutgoingBitrate = report.availableOutgoingBitrate;
            }
          }
          if (report.type === 'remote-inbound-rtp' && report.kind === 'video' &&
              typeof report.fractionLost === 'number') {
            packetLoss = Math.max(packetLoss ?? 0, report.fractionLost);
          }
        });

        let quality = 3;
        if (availableOutgoingBitrate !== null) {
          if (availableOutgoingBitrate < 220000) quality = 1;
          else if (availableOutgoingBitrate < 420000) quality = 2;
          else if (availableOutgoingBitrate < 800000) quality = 3;
          else if (availableOutgoingBitrate < 1300000) quality = 4;
          else quality = 5;
        } else if (roundTripTime !== null) {
          if (roundTripTime > 0.6) quality = 1;
          else if (roundTripTime > 0.38) quality = 2;
          else if (roundTripTime > 0.25) quality = 3;
          else if (roundTripTime > 0.15) quality = 4;
          else quality = 5;
        }
        if (roundTripTime !== null) {
          if (roundTripTime > 0.65) quality = Math.min(quality, 1);
          else if (roundTripTime > 0.4) quality = Math.min(quality, 2);
          else if (roundTripTime > 0.28) quality = Math.min(quality, 3);
        }
        if (packetLoss !== null) {
          if (packetLoss > 0.12) quality = Math.min(quality, 1);
          else if (packetLoss > 0.07) quality = Math.min(quality, 2);
          else if (packetLoss > 0.04) quality = Math.min(quality, 3);
        }

        // Require two consistent samples before changing profiles. Degradation
        // is still fast, while recovery is deliberately gradual to avoid swings.
        if (quality === pendingQuality) pendingSamples += 1;
        else {
          pendingQuality = quality;
          pendingSamples = 1;
        }
        const currentQuality = videoBitrateRef.current || 3;
        const shouldApply = quality < currentQuality ? pendingSamples >= 1 : pendingSamples >= 2;
        if (shouldApply && quality !== currentQuality) {
          const profile = qualityProfiles[quality];
          const videoSender = peer.getSenders().find(sender => sender.track?.kind === 'video');
          if (videoSender && typeof videoSender.getParameters === 'function') {
            try {
              const parameters = videoSender.getParameters();
              parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
              parameters.encodings[0].maxBitrate = profile.bitrate;
              parameters.encodings[0].maxFramerate = profile.frameRate;
              parameters.encodings[0].scaleResolutionDownBy = profile.scale;
              parameters.degradationPreference = 'maintain-framerate';
              await videoSender.setParameters(parameters);
            } catch (_) {
              // Unsupported sender parameters are ignored; WebRTC congestion
              // control remains active as a browser-managed fallback.
            }
          }
          videoBitrateRef.current = quality;
        }
        if (!cancelled) setConnectionQuality(quality);
      } catch (_) {
        if (!cancelled) setConnectionQuality(0);
      }
    };
    readConnectionQuality();
    const interval = window.setInterval(readConnectionQuality, 3000);
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
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    reconnectingRef.current = false;
    reconnectAttemptsRef.current = 0;
    setReconnecting(false);
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

  const iceProviderTiersRef = useRef([]);
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
      throw err;
    }
  }, []);

  const restartConnection = useCallback(async () => {
    const peer = peerRef.current;
    const activeCall = callRef.current;
    if (!peer || !activeCall || activeCall.status !== 'accepted' ||
        reconnectingRef.current || !navigator.onLine || reconnectAttemptsRef.current >= 5) return;
    reconnectingRef.current = true;
    setReconnecting(true);
    setStatus('Network interrupted. Reconnecting…');
    try {
      reconnectAttemptsRef.current += 1;
      // Refresh short-lived TURN credentials before an ICE restart. Both call
      // participants may initiate recovery; offer-collision handling below
      // deterministically selects the polite peer.
      const freshIce = await getCallIceConfig();
      // Always replace the cached provider list. If the credential endpoint
      // degrades to STUN-only, do not keep retrying with expired TURN credentials.
      if (Array.isArray(freshIce?.iceServerTiers) && freshIce.iceServerTiers.length) {
        iceProviderTiersRef.current = freshIce.iceServerTiers;
      } else if (Array.isArray(freshIce?.iceServers) && freshIce.iceServers.length) {
        iceProviderTiersRef.current = [{
          name: freshIce.degraded ? 'direct-stun-fallback' : 'configured-turn',
          iceServers: freshIce.iceServers,
        }];
      } else {
        iceProviderTiersRef.current = [];
      }
      // Attempts are one-based. Attempt 1 must actually use tier 0
      // (ExpressTURN primary), not skip straight to the secondary provider.
      const fallbackIndex = Math.min(
        Math.max(0, reconnectAttemptsRef.current - 1),
        Math.max(0, iceProviderTiersRef.current.length - 1)
      );
      const fallbackTier = iceProviderTiersRef.current[fallbackIndex];
      const selectedIceServers = fallbackTier?.iceServers || freshIce?.iceServers;
      if (Array.isArray(selectedIceServers) && selectedIceServers.length &&
          typeof peer.setConfiguration === 'function') {
        peer.setConfiguration({ iceServers: selectedIceServers, iceTransportPolicy: 'all', iceCandidatePoolSize: 2 });
        if (fallbackTier?.name) setStatus('Reconnecting through ' + fallbackTier.name.replace(/-/g, ' ') + '…');
      }
      const offer = await peer.createOffer({ iceRestart: true });
      await peer.setLocalDescription(offer);
      await sendDescription(String(activeCall._id), peer.localDescription);

      // Sending an ICE-restart offer is not proof of recovery. Keep the
      // reconnect lock until the peer is connected or this attempt times out.
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (peerRef.current !== peer || peer.connectionState === 'connected') return;
        reconnectingRef.current = false;
        setReconnecting(false);
        if (navigator.onLine && reconnectAttemptsRef.current < 5) {
          const delay = Math.min(10000, 1200 * (2 ** reconnectAttemptsRef.current));
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            restartConnection();
          }, delay);
        } else {
          setStatus('Unable to reconnect. Check your network or end the call and try again.');
        }
      }, 9000);
    } catch (err) {
      setError(messageFor(err, 'Automatic reconnection failed. Please check your network.'));
      reconnectingRef.current = false;
      setReconnecting(false);
      if (reconnectAttemptsRef.current < 5 && navigator.onLine) {
        const delay = Math.min(10000, 1200 * (2 ** reconnectAttemptsRef.current));
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          restartConnection();
        }, delay);
      } else {
        setStatus('Unable to reconnect. Check your network or end the call and try again.');
      }
    }
  }, [sendDescription]);

  useEffect(() => {
    const onOffline = () => {
      if (callRef.current?.status !== 'accepted') return;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      setReconnecting(true);
      setStatus('Network unavailable. Waiting for connection…');
    };
    const onOnline = () => {
      const peer = peerRef.current;
      if (callRef.current?.status !== 'accepted' || !peer || peer.connectionState === 'connected') return;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      reconnectingRef.current = false;
      restartConnection();
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, [restartConnection]);

  const makePeer = useCallback(async type => {
    const audioConstraints = {
      channelCount: { ideal: 1 },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {})
    };
    const videoConstraints = type === 'video' ? {
      width: { ideal: 640, max: 1280 },
      height: { ideal: 360, max: 720 },
      frameRate: { ideal: 24, max: 30 },
      facingMode: cameraFacingRef.current
    } : false;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints
    });
    stream.getAudioTracks().forEach(track => {
      try { track.contentHint = 'speech'; } catch (_) { /* Hint is not supported in every browser. */ }
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    const iceConfig = await getCallIceConfig();
    iceProviderTiersRef.current = Array.isArray(iceConfig?.iceServerTiers) ? iceConfig.iceServerTiers : [];
    const peer = new RTCPeerConnection({
      iceServers: Array.isArray(iceConfig?.iceServers) && iceConfig.iceServers.length ? iceConfig.iceServers : ICE_SERVERS,
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 2,
    });
    peerRef.current = peer;
    stream.getTracks().forEach(track => {
      const sender = peer.addTrack(track, stream);
      if (track.kind === 'audio') {
        // Keep voice intelligible and prioritised while limiting Opus bandwidth.
        try { track.contentHint = 'speech'; } catch (_) {}
        if (sender?.getParameters && sender?.setParameters) {
          try {
            const parameters = sender.getParameters();
            parameters.encodings = parameters.encodings?.length ? parameters.encodings : [{}];
            parameters.encodings[0].maxBitrate = 24000;
            parameters.encodings[0].priority = 'high';
            parameters.encodings[0].networkPriority = 'high';
            sender.setParameters(parameters).catch(() => {});
          } catch (_) { /* Browser defaults remain available as fallback. */ }
        }
      } else if (track.kind === 'video') {
        videoBitrateRef.current = 3;
      }
    });
    peer.ontrack = event => { if (event.streams?.[0]) setRemoteStream(event.streams[0]); };
    peer.onicecandidate = event => {
      if (!event.candidate) return;
      const id = callRef.current?._id;
      if (id) sendCandidate(String(id), event.candidate);
      else queuedLocalRef.current.push(event.candidate);
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') {
        if (reconnectTimerRef.current) {
          window.clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
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
          reconnectTimerRef.current = null;
          if (peerRef.current === peer &&
              (peer.connectionState === 'failed' || peer.connectionState === 'disconnected')) {
            restartConnection();
          }
        }, peer.connectionState === 'failed' ? 500 : 3000);
      } else if (peer.connectionState === 'connecting') {
        setStatus('Reconnecting…');
        setReconnecting(true);
      }
    };
    return peer;
  }, [sendCandidate, restartConnection, selectedMicrophoneId]);

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

  useEffect(() => {
    if (!call?._id || call.status !== 'ringing' || call.receiverUid !== currentUser?.uid) return;
    let request;
    try {
      request = JSON.parse(window.sessionStorage.getItem('dating-app-auto-answer-call') || 'null');
    } catch (_) { request = null; }
    if (!request || String(request.callId) !== String(call._id) ||
        String(request.roomId) !== String(roomId) || Date.now() - Number(request.requestedAt || 0) > 60000) return;
    try { window.sessionStorage.removeItem('dating-app-auto-answer-call'); } catch (_) {}
    // The user explicitly pressed Answer in the global incoming-call surface.
    // Start media acquisition and signaling directly, without a second click.
    acceptCall();
  }, [call?._id, call?.status, currentUser?.uid, roomId]);

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
              if (signal.description.type === 'offer' && peer.signalingState !== 'stable') {
                const active = callRef.current || next;
                const polite = String(currentUser.uid) > String(active.callerUid || '');
                if (!polite) continue;
                await peer.setLocalDescription({ type: 'rollback' });
              }
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

  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter(device => device.kind === 'audioinput');
      const outputs = devices.filter(device => device.kind === 'audiooutput');
      const cameras = devices.filter(device => device.kind === 'videoinput' && device.deviceId);
      setAudioInputs(inputs);
      setAudioOutputs(outputs);
      setVideoInputs(cameras);
      setSelectedMicrophoneId(current => current && inputs.some(device => device.deviceId === current)
        ? current : (inputs.find(device => device.deviceId)?.deviceId || ''));
      setSelectedSpeakerId(current => current && outputs.some(device => device.deviceId === current)
        ? current : (outputs.find(device => device.deviceId)?.deviceId || ''));
    } catch (_) { /* Device enumeration is optional on restricted browsers. */ }
  }, []);

  useEffect(() => {
    refreshAudioDevices();
    const onDeviceChange = () => refreshAudioDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  }, [refreshAudioDevices]);

  useEffect(() => {
    if (localStream) refreshAudioDevices();
  }, [localStream, refreshAudioDevices]);

  const applySpeaker = useCallback(async deviceId => {
    setSelectedSpeakerId(deviceId);
    const targets = [remoteAudioRef.current, remoteVideoRef.current].filter(Boolean);
    for (const target of targets) {
      if (typeof target.setSinkId === 'function') {
        try { await target.setSinkId(deviceId || ''); }
        catch (_) { setError('Unable to switch speaker. Check browser audio permissions and device availability.'); }
      }
    }
  }, []);

  const switchMicrophone = async deviceId => {
    setSelectedMicrophoneId(deviceId);
    const peer = peerRef.current;
    const stream = localStreamRef.current;
    if (!peer || !stream || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const replacementStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        video: false
      });
      const replacementTrack = replacementStream.getAudioTracks()[0];
      const currentTrack = stream.getAudioTracks()[0];
      const sender = peer.getSenders().find(item => item.track?.kind === 'audio');
      if (!replacementTrack || !sender) {
        replacementStream.getTracks().forEach(track => track.stop());
        throw new Error('Microphone switching is not supported by this browser.');
      }
      await sender.replaceTrack(replacementTrack);
      if (currentTrack) { stream.removeTrack(currentTrack); currentTrack.stop(); }
      stream.addTrack(replacementTrack);
      localStreamRef.current = stream;
      setLocalStream(new MediaStream(stream.getTracks()));
      setError('');
    } catch (err) {
      setError(messageFor(err, 'Unable to switch microphone. Check microphone permissions.'));
      await refreshAudioDevices();
    }
  };

  const switchCamera = async () => {
    const stream = localStreamRef.current;
    const peer = peerRef.current;
    if (!stream || !peer || !navigator.mediaDevices?.getUserMedia) return;
    const currentTrack = stream.getVideoTracks()[0];
    if (!currentTrack) return;
    const currentDeviceId = currentTrack.getSettings?.().deviceId || '';
    const facingNow = currentTrack.getSettings?.().facingMode || cameraFacingRef.current;
    const nextFacing = facingNow === 'environment' ? 'user' : 'environment';
    let replacementStream = null;
    try {
      // Refresh the full camera list after permission has been granted. Some
      // browsers expose labels and device IDs only after getUserMedia succeeds.
      const enumeratedDevices = (await navigator.mediaDevices.enumerateDevices()).filter(device =>
        device.kind === 'videoinput' && device.deviceId
      );
      if (enumeratedDevices.length) setVideoInputs(enumeratedDevices);
      const devices = enumeratedDevices.length ? enumeratedDevices : videoInputs;
      const alternatives = devices.filter(device => device.deviceId !== currentDeviceId);
      const preferred = alternatives.find(device => {
        const label = (device.label || '').toLowerCase();
        return nextFacing === 'environment'
          ? /back|rear|environment|world/.test(label)
          : /front|user|facetime|integrated/.test(label);
      }) || alternatives[0];

      try {
        replacementStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { exact: nextFacing } }
        });
      } catch (facingError) {
        if (!preferred) throw facingError;
        replacementStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: preferred.deviceId } }
        });
      }
      const replacementTrack = replacementStream.getVideoTracks()[0];
      const sender = peer.getSenders().find(item => item.track?.kind === 'video');
      if (!replacementTrack || !sender) throw new Error('A second camera is not available on this device.');
      await sender.replaceTrack(replacementTrack);
      stream.removeTrack(currentTrack);
      stream.addTrack(replacementTrack);
      replacementTrack.enabled = !cameraOff;
      currentTrack.stop();
      localStreamRef.current = stream;
      cameraFacingRef.current = replacementTrack.getSettings?.().facingMode || nextFacing;
      setLocalStream(new MediaStream(stream.getTracks()));
      await refreshAudioDevices();
      setError('');
    } catch (err) {
      replacementStream?.getTracks().forEach(track => track.stop());
      setError(messageFor(err, 'Could not switch camera. This device may not have another camera.'));
    }
  };

  useEffect(() => {
    const stream = localStreamRef.current;
    if (!stream) return undefined;
    const handleDeviceChange = () => {
      const tracks = stream.getTracks();
      if (tracks.some(track => track.readyState === 'ended')) {
        setError('A microphone or camera disconnected. Reconnect the device or switch it in your browser settings.');
      }
    };
    stream.getTracks().forEach(track => {
      track.onended = () => setError(`Your ${track.kind} device disconnected. Check the device and reconnect.`);
    });
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
      stream.getTracks().forEach(track => { track.onended = null; });
    };
  }, [localStream]);

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

  // A full-screen call must also take ownership of document scrolling.
  // Restore the exact previous inline styles when the call is minimized or ends.
  useEffect(() => {
    if (!active || incoming || videoMinimized) return undefined;
    const body = document.body;
    const root = document.documentElement;
    const previous = {
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
    };
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
    return () => {
      body.style.overflow = previous.bodyOverflow;
      body.style.overscrollBehavior = previous.bodyOverscroll;
      root.style.overflow = previous.rootOverflow;
      root.style.overscrollBehavior = previous.rootOverscroll;
    };
  }, [active, incoming, videoMinimized]);

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
          {otherPhotoUrl
            ? <img src={otherPhotoUrl} alt="" className="h-full w-full object-cover" />
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
    {!active || !videoCall ? status && <p className="mt-2 text-sm text-gray-600" role="status">{status}</p> : null}
    {!active || !videoCall ? error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p> : null}
    {active && !incoming && createPortal(
      <div className={`wa-call-screen ${videoMinimized ? 'wa-call-screen--mini' : ''} ${videoCall ? 'wa-call-screen--video' : 'wa-call-screen--audio'}`}
        style={videoMinimized ? { right: floatingPosition.right, bottom: floatingPosition.bottom } : undefined}
        role="dialog" aria-modal={!videoMinimized} aria-label={videoCall ? "Video call" : "Voice call"}>
        {videoCall ? <>
          <video ref={remoteVideoRef} autoPlay playsInline className="wa-call-remote-video" />
          {!remoteStream && <div className="wa-call-video-placeholder">
            <div className="wa-call-avatar">{otherPhotoUrl ? <img src={otherPhotoUrl} alt="" /> : (otherUser?.name || "♡").trim().charAt(0).toUpperCase()}</div>
            <strong>{otherUser?.name || "Video call"}</strong>
            <span>{reconnecting ? "Reconnecting…" : status || "Connecting video…"}</span>
          </div>}
        </> : <>
          <audio ref={remoteAudioRef} autoPlay />
          <div className="wa-call-audio-content">
            <div className="wa-call-avatar wa-call-avatar--large">
              {otherPhotoUrl ? <img src={otherPhotoUrl} alt="" /> : (otherUser?.name || "♡").trim().charAt(0).toUpperCase()}
            </div>
            <h2>{otherUser?.name || "Voice call"}</h2>
            <p>{call?.status === 'accepted' ? (reconnecting ? 'Reconnecting…' : formatDuration(callDuration)) : (status || 'Calling…')}</p>
            {call?.status === 'accepted' && <span className="wa-call-encryption">End-to-end connection</span>}
          </div>
        </>}
        {!videoMinimized && <header className="wa-call-header">
          <div className="wa-call-header-user">
            <span className="wa-call-header-avatar">{otherPhotoUrl ? <img src={otherPhotoUrl} alt="" /> : (otherUser?.name || "♡").trim().charAt(0).toUpperCase()}</span>
            <span className="wa-call-header-copy"><strong>{otherUser?.name || (videoCall ? "Video call" : "Voice call")}</strong><small>{call?.status === 'accepted' ? formatDuration(callDuration) : status || "Calling…"}</small></span>
          </div>
          <div className="wa-call-header-actions">
            <span className="wa-call-signal" aria-label={connectionQuality ? `Signal quality ${connectionQuality} of 5` : "Signal quality unavailable"}>
              <span className={connectionQuality >= 1 ? "is-on" : ""}/><span className={connectionQuality >= 2 ? "is-on" : ""}/><span className={connectionQuality >= 3 ? "is-on" : ""}/><span className={connectionQuality >= 4 ? "is-on" : ""}/>
            </span>
            <button type="button" onClick={() => { setAudioDevicesOpen(false); setVideoMinimized(true); }} aria-label="Minimize call" title="Minimize call"><svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg></button>
          </div>
        </header>}
        {reconnecting && !videoMinimized && <div className="wa-call-reconnecting" role="status">{navigator.onLine ? "Reconnecting call…" : "Waiting for network…"}</div>}
        {videoCall && !videoMinimized && <button type="button" onClick={() => setLocalPreviewExpanded(value => !value)}
          className={`wa-call-self-view ${localPreviewExpanded ? 'is-expanded' : ''}`} aria-label={localPreviewExpanded ? "Shrink camera preview" : "Expand camera preview"}>
          <video ref={attachLocalVideo} autoPlay muted playsInline />
          {cameraOff && <span>Camera off</span>}
          <small>You</small>
        </button>}
        {!videoMinimized && <div className="wa-call-bottom">
          {error && <p className="wa-call-error" role="alert">{error}</p>}
          {audioDevicesOpen && <div className="wa-call-device-panel">
            <label>Microphone<select aria-label="Select microphone" value={selectedMicrophoneId} onChange={event => switchMicrophone(event.target.value)}>
              {audioInputs.map((device,index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Microphone ${index+1}`}</option>)}
            </select></label>
            <label>Speaker<select aria-label="Select speaker" value={selectedSpeakerId} onChange={event => applySpeaker(event.target.value)}>
              {audioOutputs.map((device,index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Speaker ${index+1}`}</option>)}
            </select></label>
            {!remoteAudioRef.current?.setSinkId && !remoteVideoRef.current?.setSinkId && <small>Speaker selection is not supported by this browser.</small>}
          </div>}
          <div className="wa-call-controls">
            <button type="button" onClick={() => setAudioDevicesOpen(value => !value)} aria-expanded={audioDevicesOpen} aria-label="Audio settings">
              <svg viewBox="0 0 24 24"><path d="M4 7h9m4 0h3M4 17h3m4 0h9M13 4v6M7 14v6"/></svg><span>Audio</span>
            </button>
            <button type="button" onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"} className={muted ? "is-active" : ""}>
              <svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8"/></svg><span>{muted ? "Unmute" : "Mute"}</span>
            </button>
            {videoCall && <button type="button" onClick={toggleCamera} aria-label={cameraOff ? "Turn camera on" : "Turn camera off"} className={cameraOff ? "is-active" : ""}>
              <svg viewBox="0 0 24 24"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/></svg><span>Camera</span>
            </button>}
            {videoCall && <button type="button" onClick={switchCamera} aria-label="Switch camera">
              <svg viewBox="0 0 24 24"><path d="M20 7h-3l-2-2H9L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"/><circle cx="12" cy="13" r="3"/></svg><span>Flip</span>
            </button>}
            <button type="button" onClick={() => finishCall("end")} disabled={callActionInProgressRef.current} className="wa-call-end" aria-label="End call">
              <svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 1-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 0 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg><span>End</span>
            </button>
          </div>
        </div>}
        {videoMinimized && <div className="wa-call-mini-bar" onPointerDown={event => {
          if (event.button !== 0 && event.pointerType !== 'touch') return;
          floatingDragRef.current = { x: event.clientX, y: event.clientY, right: floatingPosition.right, bottom: floatingPosition.bottom };
        }}>
          <span><strong>{otherUser?.name || "Call"}</strong><small>{formatDuration(callDuration)} · {reconnecting ? "Reconnecting" : "Live"}</small></span>
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => setVideoMinimized(false)} aria-label="Restore call"><svg viewBox="0 0 24 24"><path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/></svg></button>
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={toggleMute} aria-label={muted ? "Unmute microphone" : "Mute microphone"}><svg viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1"/></svg></button>
          <button type="button" onPointerDown={event => event.stopPropagation()} onClick={() => finishCall("end")} className="wa-call-mini-end" aria-label="End call"><svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.79a2 2 0 0 0-.45 2.11L8.07 9.93a16 16 0 0 0 6 6l1.31-1.27a2 2 0 0 0 2.11-.45c.89.33 1.83.56 2.79.68A2 2 0 0 1 22 16.92z"/></svg></button>
        </div>}
      </div>,
      document.body
    )}
  </section>;
}
