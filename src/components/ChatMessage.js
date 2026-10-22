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

const resolveAvatarUrl = (value) => {
  if (!value) return 'https://placehold.co/100x100';

  let path = String(value).trim();
  try {
    if (/^https?:\/\//i.test(path)) {
      const parsed = new URL(path);
      if (parsed.pathname.startsWith('/api/media/')) {
        path = decodeURIComponent(parsed.pathname.slice('/api/media/'.length));
      } else if (isPhotoKey(parsed.pathname.slice(1))) {
        path = decodeURIComponent(parsed.pathname.slice(1));
      } else {
        return path;
      }
    } else if (path.startsWith('/api/media/')) {
      path = decodeURIComponent(path.slice('/api/media/'.length));
    } else if (path.startsWith('api/media/')) {
      path = decodeURIComponent(path.slice('api/media/'.length));
    } else {
      path = decodeURIComponent(path.replace(/^\/+/, ''));
    }
  } catch {
    return 'https://placehold.co/100x100';
  }

  if (isPhotoKey(path)) {
    return CDN_BASE
      ? `${CDN_BASE}/${encodeURIComponent(path)}`
      : `${MEDIA_API_ORIGIN}/api/media/${encodeURIComponent(path)}`;
  }

  return value;
};

const MessageStatus = ({ status }) => {
  if (status === 'read') {
    return <span className="ml-2 text-sky-400">✓✓</span>;
  }
  if (status === 'delivered') {
    return <span className="ml-2 text-gray-400">✓✓</span>;
  }
  if (status === 'sent') {
    return <span className="ml-2 text-gray-400">✓</span>;
  }
  return null;
};

const ChatMessage = ({ message, currentUser, otherUser }) => {
  const isSender = currentUser && message.senderUid === currentUser.uid;
  const userProfile = isSender ? currentUser : otherUser;
  const avatarUrl = resolveAvatarUrl(userProfile?.photos?.[0]?.url);

  return (
    <div className={`flex items-start gap-3 ${isSender ? 'flex-row-reverse' : ''}`}>
      <img
        src={avatarUrl}
        alt={userProfile?.name || 'User Avatar'}
        className="w-10 h-10 rounded-full object-cover"
        onError={(event) => {
          if (event.currentTarget.src !== 'https://placehold.co/100x100') {
            event.currentTarget.src = 'https://placehold.co/100x100';
          }
        }}
      />
      <div
        className={`max-w-xs md:max-w-md p-3 rounded-2xl shadow ${
          isSender
            ? 'bg-blue-500 text-white rounded-br-none'
            : 'bg-white dark:bg-neutral-700 text-gray-800 dark:text-neutral-200 rounded-bl-none'
        }`}
      >
        <p className="text-sm">{message.messageContent}</p>
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
