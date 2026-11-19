// Resolve the remote participant before applying the deterministic WebRTC glare tie-breaker.
// Exactly one participant must be polite, regardless of who initiated the call.
export function shouldBePolitePeer(localUid, callerUid, receiverUid) {
  const local = String(localUid || '');
  const caller = String(callerUid || '');
  const receiver = String(receiverUid || '');
  if (!local || !caller || !receiver || caller === receiver) return false;
  if (local === caller) return local > receiver;
  if (local === receiver) return local > caller;
  return false;
}
