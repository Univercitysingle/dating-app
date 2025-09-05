import React from 'react';
import { Link } from 'react-router-dom';
import { formatTimestamp } from '../utils/formatTimestamp';

const ConversationListItem = ({ conversation }) => {
  const { otherUser, lastMessage } = conversation;

  return (
    <Link to={`/chat/${conversation.roomId}`} className="flex items-center p-4 border-b border-gray-200 hover:bg-gray-50">
      <img
        src={otherUser.photos?.[0]?.url || 'https://placehold.co/150'}
        alt={otherUser.name}
        className="w-12 h-12 rounded-full object-cover mr-4"
      />
      <div className="flex-grow">
        <div className="flex justify-between">
          <h3 className="font-semibold text-gray-800">{otherUser.name}</h3>
          <p className="text-xs text-gray-500">
            {lastMessage ? formatTimestamp(lastMessage.timestamp) : ''}
          </p>
        </div>
        <p className="text-sm text-gray-600 truncate">
          {lastMessage ? lastMessage.messageContent : 'No messages yet.'}
        </p>
      </div>
    </Link>
  );
};

export default ConversationListItem;
