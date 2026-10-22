import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import logger from '../utils/logger';
import ChatMessage from '../components/ChatMessage';
import { database } from '../firebase';
import { ref, onChildAdded, off } from 'firebase/database';

function Chat() {
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const { user } = useAuth();
  const { socket, allMessages, addMessage, removeMessage } = useSocket();
  const { chatId } = useParams();
  const typingTimeoutRef = useRef(null);
  const messagesEndRef = useRef(null);
  const historyPollRef = useRef(null);
  const addMessageRef = useRef(addMessage);
  useEffect(() => { addMessageRef.current = addMessage; }, [addMessage]);

  const messages = allMessages[chatId] || [];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Keep the room hydrated from MongoDB even if Firebase RTDB or Socket.IO
    // realtime delivery is unavailable. The API enforces participant access.
    let cancelled = false;
    const syncHistory = async () => {
      try {
        const result = await apiClient.get(`/chat/history/${encodeURIComponent(chatId)}?limit=50`);
        if (!cancelled && Array.isArray(result?.messages)) {
          result.messages.forEach(message => addMessageRef.current(message));
        }
      } catch (historyError) {
        if (!cancelled) logger.debug('Chat history refresh unavailable:', historyError?.status || 'network error');
      }
    };
    if (user?.uid && chatId) {
      syncHistory();
      historyPollRef.current = setInterval(syncHistory, 3000);
    }
    return () => {
      cancelled = true;
      if (historyPollRef.current) clearInterval(historyPollRef.current);
      historyPollRef.current = null;
    };
  }, [chatId, user?.uid]);

  useEffect(() => {
    // Socket.IO Room Joining
    if (socket) {
      socket.emit('joinRoom', chatId, (ack) => {
        if (ack && ack.status === 'ok') {
          setIsRoomJoined(true);
          logger.info(`Successfully joined room via Socket.IO: ${chatId}`);
        }
      });
    }

    // Firebase Realtime Database Listener for Realtime Serverless Messages
    let chatRef;
    if (process.env.REACT_APP_ENABLE_FIREBASE_REALTIME_SYNC === 'true' && database && chatId) {
      try {
        chatRef = ref(database, `chats/${chatId}`);
        onChildAdded(chatRef, (snapshot) => {
          const msg = snapshot.val();
          if (msg) {
            addMessage({
              _id: msg._id || snapshot.key,
              roomId: chatId,
              senderUid: msg.senderUid,
              receiverUid: msg.receiverUid,
              messageContent: msg.messageContent,
              timestamp: msg.timestamp,
            });
          }
        });
        setIsRoomJoined(true);
      } catch (fbErr) {
        logger.warn('Firebase RTDB listener error:', fbErr);
      }
    }

    const uids = chatId ? chatId.split('-') : [];
    const otherUserUid = uids.find(uid => uid !== user?.uid);

    const fetchOtherUser = async () => {
      try {
        const data = await apiClient.get(`/users/${otherUserUid}`);
        setOtherUser(data);
        setIsRoomJoined(true); // Allow sending once recipient is known
      } catch (err) {
        setError('Could not load user details.');
      }
    };

    if (otherUserUid) {
      fetchOtherUser();
    }

    return () => {
      if (chatRef) {
        try {
          off(chatRef);
        } catch (e) {
          // Ignored
        }
      }
    };
  }, [socket, chatId, user?.uid]);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    const receiverUid = otherUser?.uid;
    if (!receiverUid) {
      setError("Could not determine the recipient of the message.");
      return;
    }

    const tempId = `temp_${Date.now()}`;
    const messageContent = input.trim();
    const message = {
      _id: tempId,
      roomId: chatId,
      senderUid: user.uid,
      receiverUid: receiverUid,
      messageContent: messageContent,
      timestamp: new Date().toISOString(),
    };

    // Optimistically update UI
    addMessage(message);
    setInput('');

    // Send via Socket.io if available
    let sentViaSocket = false;
    if (socket && socket.connected) {
      socket.emit('sendMessage', {
        roomId: chatId,
        messageContent,
        receiverUid,
      });
      sentViaSocket = true;
    }

    // Fallback or serverless HTTP transmission
    if (!sentViaSocket) {
      try {
        const savedMessage = await apiClient.post('/chat/send', {
          roomId: chatId,
          messageContent,
          receiverUid,
        });
        if (savedMessage && savedMessage._id) {
          addMessage({ ...savedMessage, _id: String(savedMessage._id), roomId: savedMessage.roomId || chatId });
        }
      } catch (sendErr) {
        logger.error('Failed to send message via HTTP fallback:', sendErr);
        removeMessage(chatId, tempId);
        setInput(messageContent);
        logger.warn('The message was not persisted; the draft has been restored.');
      }
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);

    if (!socket || !otherUser?.uid) return;

    if (!typingTimeoutRef.current) {
      socket.emit('typing', { roomId: chatId, receiverUid: otherUser.uid });
    } else {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('stopTyping', { roomId: chatId, receiverUid: otherUser.uid });
      typingTimeoutRef.current = null;
    }, 2000);
  };

  if (error) {
    return <p className="text-red-500 p-4">{error}</p>;
  }

  if (!user) {
    return <p className="p-4">Please log in to chat.</p>;
  }

  return (
    <div className="container mx-auto flex flex-col h-screen max-w-2xl border-x border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 shadow-md p-4 flex justify-between items-center flex-shrink-0">
        {otherUser ? (
          <>
            <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{otherUser.name}</h2>
            <Link to={`/profile/${otherUser.uid}`} className="text-blue-500 hover:text-blue-700">
              View Profile
            </Link>
          </>
        ) : (
          <h2 className="text-2xl font-bold text-center text-gray-800 dark:text-white">Chat Room</h2>
        )}
      </header>
      <main className="flex-grow p-4 overflow-y-auto">
        <div className="space-y-4">
          {messages.map((msg) => (
            <ChatMessage
              key={msg._id}
              message={msg}
              currentUser={user}
              otherUser={otherUser}
            />
          ))}
        </div>
        <div ref={messagesEndRef} />
        {isTyping && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm p-2">
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse"></div>
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:0.2s]"></div>
            <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse [animation-delay:0.4s]"></div>
          </div>
        )}
      </main>
      <footer className="bg-white dark:bg-gray-800 p-4 flex-shrink-0">
        <form onSubmit={sendMessage} className="flex">
          <input
            value={input}
            onChange={handleInputChange}
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