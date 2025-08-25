import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import logger from '../utils/logger';

function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const socketRef = useRef(null);
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem("authToken");
    if (!token) {
      setError("No auth token found for chat connection.");
      return;
    }

    const API_URL = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5000';
    socketRef.current = io(API_URL, {
      auth: {
        token: token,
      },
    });

    socketRef.current.on('connect', () => {
      logger.info('Socket connected');
      socketRef.current.emit('joinRoom', 'general');
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
  }, [user]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socketRef.current.emit('sendMessage', {
      roomId: 'general',
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
    <div className="flex flex-col h-screen p-4">
      <h2 className="text-2xl font-bold mb-4">Chat Room</h2>
      <div className="flex-grow p-4 border rounded overflow-y-auto mb-4">
        {messages.map((msg, idx) => (
          <div key={idx} className="mb-2">
            <span className="font-bold">{msg.user}: </span>
            <span>{msg.message}</span>
            <span className="text-xs text-gray-500 ml-2">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
      </div>
      <div className="flex">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-grow p-2 border rounded-l"
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded-r"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default Chat;
