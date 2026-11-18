import React from 'react';
import { Link } from 'react-router-dom';
import { formatTimestamp } from '../utils/formatTimestamp';
import { resolvePhotoUrl, resolveWorkerPhotoUrl, PLACEHOLDER_IMAGE } from '../utils/media';

const ConversationListItem = ({ conversation }) => {
  const otherUser = conversation?.otherUser || {};
  const lastMessage = conversation?.lastMessage || null;
  const unreadCountValue = Number(conversation?.unreadCount);
  const unreadCount = Number.isFinite(unreadCountValue) ? Math.max(0, unreadCountValue) : 0;
  const hasUnread = unreadCount > 0;
  const firstPhoto = otherUser.photos?.[0];
  const photoValue = typeof firstPhoto === 'string' ? firstPhoto : firstPhoto?.url;
  const avatarUrl = resolvePhotoUrl(photoValue);
  const workerFallbackUrl = resolveWorkerPhotoUrl(photoValue);

  return (
    <Link to={`/chat/${conversation.roomId}`} className={`conversation-row flex items-center gap-3 p-4 transition-colors ${hasUnread ? "bg-rose-50/70 ring-1 ring-inset ring-rose-100 is-unread" : ""}`} aria-label={`${otherUser.name || 'Conversation'}${hasUnread ? `, ${unreadCount} unread messages` : ''}`}>
      <img
        src={avatarUrl}
        alt={otherUser?.name || 'Profile photo'}
        className={`conversation-avatar h-14 w-14 flex-shrink-0 rounded-full object-cover ${hasUnread ? "ring-2 ring-rose-400 ring-offset-2 is-unread" : ""}`}
        onError={(event) => {
          const image = event.currentTarget;
          if (workerFallbackUrl && image.src !== workerFallbackUrl) {
            image.src = workerFallbackUrl;
            return;
          }
          if (image.src !== PLACEHOLDER_IMAGE) image.src = PLACEHOLDER_IMAGE;
        }}
      />
      <div className="min-w-0 flex-grow">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className={`truncate ${hasUnread ? "font-bold text-gray-950" : "font-semibold text-gray-900"}`}>{otherUser.name || 'Conversation'}</h3>
          <p className={`text-xs ${hasUnread ? "font-semibold text-rose-600" : "text-gray-500"}`}>
            {lastMessage ? formatTimestamp(lastMessage.timestamp) : ''}
          </p>
        </div>
        <p className={`truncate text-sm ${hasUnread ? "font-semibold text-gray-900" : "text-gray-600"}`}>
          {lastMessage ? lastMessage.messageContent : 'No messages yet.'}
        </p>
      </div>
      {hasUnread && <span className="inline-flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-xs font-bold text-white" aria-label={`${unreadCount} unread messages`}>{unreadCount > 99 ? "99+" : unreadCount}</span>}
    </Link>
  );
};

export default ConversationListItem;
