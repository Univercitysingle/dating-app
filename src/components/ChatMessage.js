import React from 'react';

const MessageStatus = ({ status }) => {
  if (status === 'read') {
    // Using a distinct blue for read receipts, similar to popular apps
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
  const avatarUrl = userProfile?.photos?.[0]?.url || 'https://placehold.co/100x100';

  return (
    <div className={`flex items-start gap-3 ${isSender ? 'flex-row-reverse' : ''}`}>
      <img
        src={avatarUrl}
        alt={userProfile?.name || 'User Avatar'}
        className="w-10 h-10 rounded-full object-cover"
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