import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';
import ChatMessage from '../components/ChatMessage';
import { API_URL } from '../utils/constants';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const { user } = useAuth();
  const { chatId } = useParams();

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("authToken");
    if (!token) {
      setError("No auth token found for chat connection.");
      return;
    }

    socketRef.current = io(API_URL, {
      auth: {
        token: token,
      },
    });

    socketRef.current.on('connect', () => {
      logger.info('Socket connected');
      socketRef.current.emit('joinRoom', chatId);
    });

    socketRef.current.on('message', (message) => {
      setMessages((msgs) => [...msgs, message]);
    });

    socketRef.current.on('connect_error', (err) => {
      logger.error('Socket connection error:', err);
      setError('Failed to connect to chat server.');
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [user, chatId]);

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    socketRef.current.emit('sendMessage', {
      roomId: chatId,
      message: input,
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
            placeholder="Type a message..."
          />
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded-r-md"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}

export default Chat;
