/**
 * Record a signaling message only after it has been safely consumed.
 * Failed SDP negotiation must remain eligible for the next polling cycle.
 */
export function markCallSignalHandled(seenSignals, signalId, succeeded = true) {
  if (!seenSignals || typeof seenSignals.add !== "function" || !signalId || !succeeded) return false;
  seenSignals.add(signalId);
  return true;
}
