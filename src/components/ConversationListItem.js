import React from 'react';
import { Link } from 'react-router-dom';
import { formatTimestamp } from '../utils/formatTimestamp';

const ConversationListItem = ({ conversation }) => {
  const { otherUser, lastMessage, unreadCount } = conversation;

  return (
    <Link
      to={`/chat/${conversation.roomId}`}
      className="flex items-center w-full p-4 border-b border-gray-200 hover:bg-gray-100 transition-colors"
    >
      {/* Profile Picture */}
      <img
        src={otherUser?.photos?.[0]?.url || 'https://placehold.co/100x100?text=User'}
        alt={otherUser?.name || 'User'}
        className="w-12 h-12 md:w-14 md:h-14 rounded-full object-cover mr-4"
      />

      {/* Chat Content */}
      <div className="flex-grow min-w-0">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-gray-800 truncate max-w-[60%]">
            {otherUser?.name || 'Unknown User'}
          </h3>
          <p className="text-xs text-gray-500 shrink-0">
            {lastMessage ? formatTimestamp(lastMessage.timestamp) : ''}
          </p>
        </div>

        <div className="flex justify-between items-center mt-1">
          <p className="text-sm text-gray-600 truncate max-w-[80%]">
            {lastMessage ? lastMessage.messageContent : 'No messages yet.'}
          </p>

          {/* Unread Badge */}
          {unreadCount > 0 && (
            <span className="ml-2 flex items-center justify-center bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5">
              {unreadCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
};

export default ConversationListItem;
