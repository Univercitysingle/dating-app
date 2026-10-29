import apiClient from '../api/apiClient';

const DEFAULT_STUN_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['stun:global.stun.twilio.com:3478'] },
];

export async function getVideoRoomIceConfig() {
  try {
    const config = await apiClient.get('/video-rooms/ice-config');
    if (Array.isArray(config?.iceServerTiers) && config.iceServerTiers.length) return config;
    if (Array.isArray(config?.iceServers) && config.iceServers.length) {
      return { ...config, iceServerTiers: [{ name: 'configured', iceServers: config.iceServers }] };
    }
  } catch (error) {
    // Use STUN-only as a degraded fallback if the credential endpoint is unavailable.
  }
  return {
    iceServers: DEFAULT_STUN_SERVERS,
    iceServerTiers: [{ name: 'direct-stun', iceServers: DEFAULT_STUN_SERVERS }],
    iceTransportPolicy: 'all', turnConfigured: false, credentialExpiresAt: null, degraded: true,
  };
}

/**
 * Calls the supplied signaling callback for each ordered ICE tier. The callback
 * must complete offer/answer signaling; this helper waits for ICE connectivity,
 * closes failed peer connections, and retries the next tier.
 */
export async function connectWithIceFailover({ config, negotiate, timeoutMs = 12000, onAttempt = () => {} }) {
  if (typeof negotiate !== 'function') throw new TypeError('A WebRTC negotiate callback is required.');
  const tiers = Array.isArray(config?.iceServerTiers) && config.iceServerTiers.length
    ? config.iceServerTiers
    : [{ name: 'configured', iceServers: config?.iceServers || DEFAULT_STUN_SERVERS }];
  let lastError;
  for (let index = 0; index < tiers.length; index += 1) {
    const tier = tiers[index];
    const peer = new RTCPeerConnection({ iceServers: tier.iceServers, iceTransportPolicy: 'all', iceCandidatePoolSize: 2 });
    onAttempt({ tier: tier.name || ('tier-' + (index + 1)), index, total: tiers.length });
    try {
      await negotiate(peer, tier);
      await new Promise((resolve, reject) => {
        if (peer.connectionState === 'connected' || peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') return resolve();
        let finished = false;
        const cleanup = () => { clearTimeout(timer); peer.removeEventListener('connectionstatechange', checkState); peer.removeEventListener('iceconnectionstatechange', checkState); };
        const done = (callback, value) => { if (finished) return; finished = true; cleanup(); callback(value); };
        const checkState = () => {
          if (peer.connectionState === 'connected' || peer.iceConnectionState === 'connected' || peer.iceConnectionState === 'completed') done(resolve);
          else if (peer.connectionState === 'failed' || peer.iceConnectionState === 'failed' || peer.iceConnectionState === 'closed') done(reject, new Error('ICE connection failed using ' + (tier.name || 'the selected tier') + '.'));
        };
        const timer = setTimeout(() => done(reject, new Error('ICE connection timed out using ' + (tier.name || 'the selected tier') + '.')), timeoutMs);
        peer.addEventListener('connectionstatechange', checkState);
        peer.addEventListener('iceconnectionstatechange', checkState);
        checkState();
      });
      return { peerConnection: peer, tier: tier.name || ('tier-' + (index + 1)), attempts: index + 1 };
    } catch (error) {
      lastError = error;
      try { peer.close(); } catch (_) {}
    }
  }
  throw lastError || new Error('All ICE connection paths failed.');
}

export default { getVideoRoomIceConfig, connectWithIceFailover };


/**
 * General voice/video calls use the same short-lived TURN credentials as Video
 * Rooms, but do not require the optional Video Rooms subscription.
 */
export async function getCallIceConfig() {
  try {
    const config = await apiClient.get('/calls/ice-config');
    if (Array.isArray(config?.iceServers) && config.iceServers.length) return config;
  } catch (_) {
    // Preserve basic calling when the TURN credential endpoint is unavailable.
  }
  return {
    iceServers: DEFAULT_STUN_SERVERS,
    iceTransportPolicy: 'all',
    turnConfigured: false,
    degraded: true,
  };
}
