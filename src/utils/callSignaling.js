/**
 * Record a signaling message only after it has been safely consumed.
 * Failed SDP negotiation must remain eligible for the next polling cycle.
 */
export function markCallSignalHandled(seenSignals, signalId, succeeded = true) {
  if (!seenSignals || typeof seenSignals.add !== "function" || !signalId || !succeeded) return false;
  seenSignals.add(signalId);
  return true;
}


export async function applyRemoteIceCandidate(peer, candidate) {
  if (!peer || !candidate || typeof peer.addIceCandidate !== "function") return false;
  try {
    await peer.addIceCandidate(candidate);
    return true;
  } catch {
    return false;
  }
}

export async function flushQueuedRemoteCandidates(peer, queue) {
  if (!peer || !Array.isArray(queue)) return 0;
  let applied = 0;
  for (let index = 0; index < queue.length;) {
    const candidate = queue[index];
    if (await applyRemoteIceCandidate(peer, candidate)) {
      queue.splice(index, 1);
      applied += 1;
    } else {
      index += 1;
    }
  }
  return applied;
}
