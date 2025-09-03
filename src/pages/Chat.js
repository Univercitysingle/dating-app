import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import logger from '../utils/logger';
import ChatMessage from '../components/ChatMessage';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const { user } = useAuth();
  const socket = useSocket();
  const { chatId } = useParams();

  useEffect(() => {
    if (socket) {
      socket.emit('joinRoom', chatId, (ack) => {
        if (ack && ack.status === 'ok') {
          setIsRoomJoined(true);
          logger.info(`Successfully joined room: ${chatId}`);
        }
      });

      const messageListener = (message) => {
        if (message.roomId === chatId) {
          setMessages((msgs) => {
            if (msgs.some((m) => m._id === message._id)) {
              return msgs;
            }
            return [...msgs, message];
          });
        }
      };

      socket.on('message', messageListener);

      return () => {
        socket.off('message', messageListener);
      };
    }
  }, [socket, chatId]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !socket) return;

    const uids = chatId.split('-');
    const receiverUid = uids.find(uid => uid !== user.uid);

    if (!receiverUid) {
      setError("Could not determine the recipient of the message.");
      return;
    }

    const tempId = Date.now();
    const message = {
      _id: tempId,
      roomId: chatId,
      senderUid: user.uid,
      receiverUid: receiverUid,
      messageContent: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((msgs) => [...msgs, message]);

    socket.emit('sendMessage', {
      roomId: chatId,
      messageContent: input,
      receiverUid: receiverUid,
    });
    setInput('');
  };

  if (error) {
    return <p className="text-red-500">{error}</p>;
  }

  if (!user) {
    return <p>Please log in to chat.</p>;
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-md p-4">
        <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white">Chat Room</h2>
      </header>
      <main className="flex-grow p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <ChatMessage key={idx} message={msg} />
          ))}
        </div>
      </main>
      <footer className="bg-white dark:bg-gray-800 p-4">
        <form onSubmit={sendMessage} className="flex">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-grow p-2 border rounded-l-md dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder={isRoomJoined ? "Type a message..." : "Connecting to chat..."}
            disabled={!isRoomJoined}
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded-r-md disabled:bg-blue-300"
            disabled={!isRoomJoined}
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}

export default Chat;
