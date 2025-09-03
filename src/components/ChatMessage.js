import React from 'react';
import { useAuth } from '../context/AuthContext';

const ChatMessage = ({ message }) => {
  const { user } = useAuth();
  const isSender = user && message.senderUid === user.uid;

  return (
    <div className={`flex items-end ${isSender ? 'justify-end' : ''}`}>
      <div
        className={`px-4 py-2 rounded-lg ${
          isSender
            ? 'bg-blue-500 text-white'
            : 'bg-gray-200 text-gray-800'
        }`}
      >
        <p className="text-sm">{message.messageContent}</p>
        <p className="text-xs text-right mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
};

export default ChatMessage;
