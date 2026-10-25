import React from 'react';

const MEDIA_API_ORIGIN =
  process.env.REACT_APP_MEDIA_API_ORIGIN ||
  'https://dating-app-api-staging.enadoctemp.workers.dev';

const configuredCdn = String(process.env.REACT_APP_CDN_HOSTNAME || '').trim();
const CDN_BASE = configuredCdn
  ? (configuredCdn.startsWith('https://') ? configuredCdn : `https://${configuredCdn}`).replace(/\/+$/, '')
  : '';

const isPhotoKey = (value) =>
  /^photos-[A-Za-z0-9_-]{1,128}-(?:[0-9a-f-]{36}|[0-9]{10,16})\.(?:jpg|jpeg|png|gif|webp)$/i.test(value);

const extractPhotoKey = (value) => {
  if (!value) return '';
  let path = String(value).trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const parsed = new URL(path);
      if (parsed.pathname.startsWith('/api/media/')) {
        path = decodeURIComponent(parsed.pathname.slice('/api/media/'.length));
      } else {
        path = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
      }
    } else if (path.startsWith('/api/media/')) {
      path = decodeURIComponent(path.slice('/api/media/'.length));
    } else if (path.startsWith('api/media/')) {
      path = decodeURIComponent(path.slice('api/media/'.length));
    } else {
      path = decodeURIComponent(path.replace(/^\/+/, ''));
    }
  } catch {
    return '';
  }
  return isPhotoKey(path) ? path : '';
};

const resolveAvatarUrl = (value) => {
  if (!value) return 'https://placehold.co/100x100';
  const key = extractPhotoKey(value);
  if (!key) return value;
  return CDN_BASE
    ? `${CDN_BASE}/${encodeURIComponent(key)}`
    : `${MEDIA_API_ORIGIN}/api/media/${encodeURIComponent(key)}`;
};

const MessageStatus = ({ status }) => {
  if (status === 'read') {
    return <span className="ml-2 text-sky-400" title="Read" aria-label="Read">✓✓</span>;
  }
  if (status === 'delivered') {
    return <span className="ml-2 text-gray-400" title="Delivered" aria-label="Delivered">✓✓</span>;
  }
  if (status === 'sent') {
    return <span className="ml-2 text-gray-400" title="Sent" aria-label="Sent">✓</span>;
  }
  return null;
};

const formatDuration = seconds => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const CallHistoryMessage = ({ call, currentUser }) => {
  const isVideo = call?.type === 'video';
  const incomingMissed = call?.status === 'missed' && call?.receiverUid === currentUser?.uid;
  const label = call?.status === 'missed'
    ? (incomingMissed ? 'Missed call' : 'No answer')
    : call?.status === 'declined' ? 'Call declined'
    : call?.status === 'ended' ? 'Call ended'
    : call?.status === 'accepted' ? 'Call connected'
    : call?.status === 'ringing' ? (call?.receiverUid === currentUser?.uid ? 'Incoming call' : 'Outgoing call')
    : 'Call';
  const start = call?.connectedAt ? new Date(call.connectedAt).getTime() : 0;
  const end = call?.endedAt ? new Date(call.endedAt).getTime() : (call?.status === 'accepted' ? Date.now() : 0);
  const duration = start && end >= start ? Math.floor((end - start) / 1000) : 0;

  return (
    <div className="call-history-row flex justify-center py-1" role="note" aria-label={`${label}, ${isVideo ? 'video' : 'voice'} call`}>
      <div className={`call-history-chip flex max-w-full items-center gap-3 rounded-2xl border px-4 py-3 ${incomingMissed ? 'call-history-missed' : ''}`}>
        <span className="call-history-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full" aria-hidden="true">
          {isVideo ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="3" y="6" width="12" height="12" rx="2"/><path d="m15 10 6-3v10l-6-3z"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3a14 14 0 0 1-5-5l3-2-2-5z"/></svg>
          )}
        </span>
        <span className="min-w-0 text-left">
          <span className="block text-sm font-semibold">{label} · {isVideo ? 'Video' : 'Voice'}</span>
          <span className="block text-xs text-gray-500">
            {new Date(call?.createdAt || call?.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {duration > 0 ? ` · ${formatDuration(duration)}` : ''}
          </span>
        </span>
      </div>
    </div>
  );
};

const ChatMessage = ({ message, currentUser, otherUser }) => {
  if (message?.messageType === 'call') return <CallHistoryMessage call={message.call} currentUser={currentUser} />;
  const isSender = currentUser && message.senderUid === currentUser.uid;
  const userProfile = isSender ? currentUser : otherUser;
  const photoValue = userProfile?.photos?.[0]?.url;
  const avatarUrl = resolveAvatarUrl(photoValue);
  const photoKey = extractPhotoKey(photoValue);
  const workerFallbackUrl = photoKey
    ? `${MEDIA_API_ORIGIN}/api/media/${encodeURIComponent(photoKey)}`
    : '';

  return (
    <div className={`flex items-start gap-3 ${isSender ? 'flex-row-reverse' : ''}`}>
      <img
        src={avatarUrl}
        data-worker-fallback={workerFallbackUrl}
        alt={userProfile?.name || 'User Avatar'}
        className="h-10 w-10 flex-shrink-0 rounded-full object-cover ring-2 ring-white shadow-sm"
        onError={(event) => {
          const image = event.currentTarget;
          const fallback = image.dataset.workerFallback;
          if (fallback && image.src !== fallback) {
            image.src = fallback;
            return;
          }
          if (image.src !== 'https://placehold.co/100x100') {
            image.src = 'https://placehold.co/100x100';
          }
        }}
      />
      <div
        className={`chat-bubble max-w-[82%] break-words p-3 sm:max-w-md rounded-2xl shadow-sm ${
          isSender
            ? 'chat-bubble-sent text-white rounded-br-md'
             : 'chat-bubble-received text-gray-800 dark:text-neutral-200 rounded-bl-md'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-6">{message.messageContent}</p>
        <div className="flex items-center justify-end mt-1">
          <p className={`text-xs ${isSender ? 'text-blue-200' : 'text-gray-400 dark:text-neutral-400'}`}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          {isSender && <MessageStatus status={message.status} />}
        </div>
      </div>
    </div>
  );
};

export default ChatMessage;
