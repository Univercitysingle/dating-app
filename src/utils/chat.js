const MESSAGE_ID_PATTERN = /^[a-fA-F0-9]{24}$/;

export const getVisibleChatMessageIds = (entries, minimumRatio = 0.6) => {
  const threshold = Number.isFinite(minimumRatio)
    ? Math.min(1, Math.max(0, minimumRatio))
    : 0.6;

  return (Array.isArray(entries) ? entries : [])
    .filter(entry =>
      entry?.isIntersecting === true &&
      Number(entry.intersectionRatio) >= threshold
    )
    .map(entry => entry.target?.getAttribute?.('data-chat-message-id'))
    .filter(id => typeof id === 'string' && MESSAGE_ID_PATTERN.test(id));
};

export const collectPendingDeliveryMessages = (fetchedMessages, pendingMessages, receiverUid) => {
  if (!(pendingMessages instanceof Map) || typeof receiverUid !== 'string' || !receiverUid) {
    return [];
  }

  (Array.isArray(fetchedMessages) ? fetchedMessages : []).forEach(message => {
    const id = String(message?._id || '');
    if (!/^[a-fA-F0-9]{24}$/.test(id) || message?.receiverUid !== receiverUid) return;

    if (message.status === 'sent') {
      pendingMessages.set(id, message);
    } else {
      // A later persisted status supersedes any locally queued receipt.
      pendingMessages.delete(id);
    }
  });

  return Array.from(pendingMessages.values());
};


/**
 * Resolve the other participant from a room ID when the authenticated UID is
 * known. Anchoring the exact UID at either edge avoids unsafe hyphen splitting.
 */
export const getChatPeerUidFromRoomId = (roomId, currentUid) => {
  if (typeof roomId !== 'string' || typeof currentUid !== 'string' ||
      !currentUid || roomId.length > 260 || roomId.length < currentUid.length + 2) {
    return null;
  }

  const prefix = `${currentUid}-`;
  const suffix = `-${currentUid}`;
  let peerUid = null;
  if (roomId.startsWith(prefix)) peerUid = roomId.slice(prefix.length);
  else if (roomId.endsWith(suffix)) peerUid = roomId.slice(0, -suffix.length);

  if (!peerUid || peerUid === currentUid || peerUid.length > 128) return null;
  return peerUid;
};
