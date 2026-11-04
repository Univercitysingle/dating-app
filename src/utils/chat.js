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
