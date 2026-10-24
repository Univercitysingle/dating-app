import React from 'react';
import { Link } from 'react-router-dom';
import { formatTimestamp } from '../utils/formatTimestamp';

const ConversationListItem = ({ conversation }) => {
  const { otherUser, lastMessage } = conversation;

  return (
    <Link to={`/chat/${conversation.roomId}`} className="conversation-row flex items-center gap-3 p-4">
      <img
        src={otherUser.photos?.[0]?.url || 'https://placehold.co/150'}
        alt={otherUser.name}
        className="conversation-avatar h-14 w-14 flex-shrink-0 rounded-full object-cover"
      />
      <div className="min-w-0 flex-grow">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="truncate font-semibold text-gray-900">{otherUser.name}</h3>
          <p className="text-xs text-gray-500">
            {lastMessage ? formatTimestamp(lastMessage.timestamp) : ''}
          </p>
        </div>
        <p className="truncate text-sm text-gray-600">
          {lastMessage ? lastMessage.messageContent : 'No messages yet.'}
        </p>
      </div>
    </Link>
  );
};

export default ConversationListItem;
