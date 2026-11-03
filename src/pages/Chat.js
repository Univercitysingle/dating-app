import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import logger from '../utils/logger';
import { resolvePhotoUrl, resolveWorkerPhotoUrl, PLACEHOLDER_IMAGE } from '../utils/media';
import ChatMessage from '../components/ChatMessage';
import ChatCallPanel from '../components/ChatCallPanel';
import { database } from '../firebase';
import { ref, onChildAdded, off } from 'firebase/database';

function Chat() {
  const [input, setInput] = useState('');
  const [error, setError] = useState(null);
  const [isRoomJoined, setIsRoomJoined] = useState(false);
  const [otherUser, setOtherUser] = useState(null);
  const [isTyping, setIsTyping] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [callHistory, setCallHistory] = useState([]);
  const { user } = useAuth();
  const { socket, allMessages, addMessage, removeMessage } = useSocket();
  const { chatId } = useParams();
  const typingTimeoutRef = useRef(null);
  const typingLastSentAtRef = useRef(0);
  const messagesEndRef = useRef(null);
  const historyPollRef = useRef(null);
  const addMessageRef = useRef(addMessage);
  useEffect(() => { addMessageRef.current = addMessage; }, [addMessage]);

  const messages = allMessages[chatId] || [];
  const otherUserUid = chatId ? chatId.split('-').find(uid => uid && uid !== user?.uid) : null;
  const otherProfilePath = otherUser?.uid || otherUserUid ? `/profile/${encodeURIComponent(otherUser?.uid || otherUserUid)}` : '/profile';

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
          const undelivered = result.messages.filter(message =>
            message.receiverUid === user.uid && message.status === 'sent' &&
            message._id && /^[a-fA-F0-9]{24}$/.test(String(message._id))
          );
          if (undelivered.length) {
            try {
              await apiClient.post('/chat/delivered', {
                roomId: chatId,
                messageIds: undelivered.map(message => String(message._id)),
              });
              if (!cancelled) undelivered.forEach(message =>
                addMessageRef.current({ ...message, status: 'delivered' })
              );
            } catch (deliveryError) {
              logger.debug('Message delivery receipt deferred:', deliveryError?.status || 'network error');
            }
          }
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
    let cancelled = false;
    const refreshCallHistory = async () => {
      try {
        const result = await apiClient.get('/calls/history', { params: { roomId: chatId } });
        if (!cancelled && Array.isArray(result?.calls)) setCallHistory(result.calls);
      } catch (historyError) {
        if (!cancelled) logger.debug('Call history refresh unavailable:', historyError?.status || 'network error');
      }
    };
    if (user?.uid && chatId) {
      refreshCallHistory();
      const interval = window.setInterval(refreshCallHistory, 15000);
      return () => { cancelled = true; window.clearInterval(interval); };
    }
    return () => { cancelled = true; };
  }, [chatId, user?.uid]);

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (chatId) apiClient.post('/chat/typing', { roomId: chatId, isTyping: false }).catch(() => {});
  }, [chatId]);

  useEffect(() => {
    let cancelled = false;
    const refreshTyping = async () => {
      try {
        const result = await apiClient.get('/chat/typing', { params: { roomId: chatId } });
        if (!cancelled) setIsTyping(Boolean(result?.isTyping));
      } catch (_) {
        if (!cancelled) setIsTyping(false);
      }
    };
    if (user?.uid && chatId) {
      refreshTyping();
      const interval = window.setInterval(refreshTyping, 1200);
      return () => { cancelled = true; window.clearInterval(interval); };
    }
    return () => { cancelled = true; };
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
    if (!input.trim() || isSending) return;

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
      status: 'sending',
    };

    // Stop the live typing signal as the message is submitted.
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    typingLastSentAtRef.current = 0;
    if (socket?.connected) socket.emit('stopTyping', { roomId: chatId, receiverUid });
    apiClient.post('/chat/typing', { roomId: chatId, isTyping: false }).catch(() => {});

    // Optimistically update UI
    addMessage(message);
    setInput('');
    setError(null);
    setIsSending(true);

    // MongoDB through the Worker API is the authoritative message store.
    // Socket.IO is disabled in the Cloudflare serverless deployment and must
    // never be treated as proof that a message was persisted.
    try {
      const savedMessage = await apiClient.post('/chat/send', {
        roomId: chatId,
        messageContent,
        receiverUid,
      });
      if (!savedMessage || !savedMessage._id) {
        throw new Error('The chat service did not confirm message persistence.');
      }
      addMessage({
        ...savedMessage,
        _id: String(savedMessage._id),
        roomId: savedMessage.roomId || chatId,
        status: savedMessage.status || 'sent',
      });
    } catch (sendErr) {
      logger.error('Failed to persist chat message:', sendErr);
      removeMessage(chatId, tempId);
      setInput(messageContent);
      setError('Message could not be sent. Your text has been restored. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInput(value);
    if (!otherUser?.uid) return;

    const wasTyping = Boolean(typingTimeoutRef.current);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (value.trim()) {
      const now = Date.now();
      if (!wasTyping || now - typingLastSentAtRef.current > 2500) {
        if (socket?.connected) socket.emit('typing', { roomId: chatId, receiverUid: otherUser.uid });
        apiClient.post('/chat/typing', { roomId: chatId, isTyping: true }).catch(() => {});
        typingLastSentAtRef.current = now;
      }
      typingTimeoutRef.current = setTimeout(() => {
        if (socket?.connected) socket.emit('stopTyping', { roomId: chatId, receiverUid: otherUser.uid });
        apiClient.post('/chat/typing', { roomId: chatId, isTyping: false }).catch(() => {});
        typingLastSentAtRef.current = 0;
        typingTimeoutRef.current = null;
      }, 1800);
    } else {
      if (socket?.connected) socket.emit('stopTyping', { roomId: chatId, receiverUid: otherUser.uid });
      apiClient.post('/chat/typing', { roomId: chatId, isTyping: false }).catch(() => {});
      typingLastSentAtRef.current = 0;
      typingTimeoutRef.current = null;
    }
  };

  if (!user) {
    return <p className="p-4">Please log in to chat.</p>;
  }

  return (
    <div className="chat-shell chat-whatsapp-shell flex flex-col">
      <header className="chat-header chat-whatsapp-header flex flex-shrink-0 items-center justify-between gap-3 px-3 sm:px-5">
        <Link to="/conversations" aria-label="Back to conversations" className="chat-back-link flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-lg transition" title="All conversations">
          <span aria-hidden="true">←</span>
        </Link>
        <Link to={otherProfilePath} className="chat-participant-link flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left" aria-label={`View ${otherUser?.name || 'chat participant'}'s profile`}>
          <div aria-hidden="true" className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-pink-100 text-base font-bold text-pink-700 ring-1 ring-pink-100">
            {otherUser?.photos?.[0]?.url ? <img src={resolvePhotoUrl(otherUser.photos[0].url)} alt="" className="h-full w-full object-cover" onError={(event) => { const image = event.currentTarget; const fallback = resolveWorkerPhotoUrl(otherUser.photos[0].url); if (fallback && image.src !== fallback) { image.src = fallback; return; } image.src = PLACEHOLDER_IMAGE; }} /> : (otherUser?.name || '?').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold text-gray-900">{otherUser?.name || 'Conversation'}</h2>
            <p className="chat-participant-status text-xs">{otherUser ? 'Your conversation' : 'Profile details loading'}</p>
          </div>
        </Link>
        <div id={`chat-call-actions-${chatId}`} className="chat-header-actions flex flex-shrink-0 items-center gap-1.5" aria-label="Voice and video call actions" />
      </header>
      {error && <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800" role="alert">{error}</div>}
      {otherUser && user && <ChatCallPanel roomId={chatId} currentUser={user} otherUser={otherUser} />}
      <main className="chat-messages chat-wallpaper flex-grow overflow-y-auto px-3 py-5 sm:px-6">
        <div className="chat-message-stack mx-auto flex max-w-3xl flex-col gap-3">
          {[...messages, ...callHistory.map(call => ({
            _id: `call-${call._id}`,
            messageType: 'call',
            call,
            senderUid: call.callerUid,
            receiverUid: call.receiverUid,
            timestamp: call.createdAt || call.updatedAt,
          }))].sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime()).map((msg) => (
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
          <div className="chat-typing-indicator flex items-center gap-1.5" role="status" aria-label="The other person is typing">
            <span /><span /><span />
          </div>
        )}
      </main>
      <footer className="chat-composer chat-whatsapp-composer flex-shrink-0">
        <form onSubmit={sendMessage} className="chat-composer-form mx-auto flex w-full max-w-3xl items-center gap-2 sm:gap-3">
          <span className="chat-composer-mark" aria-hidden="true">♡</span>
          <input
            value={input}
            onChange={handleInputChange}
            className="chat-message-input flex-grow"
            placeholder={isRoomJoined ? "Write a message…" : "Connecting to chat…"}
            aria-label="Message"
            autoComplete="off"
            disabled={!isRoomJoined}
          />
          <button
            type="submit"
            className="chat-send-button flex-shrink-0 disabled:cursor-not-allowed"
            disabled={!isRoomJoined || !input.trim() || isSending}
            aria-label={isSending ? 'Sending message' : 'Send message'}
            title={isSending ? 'Sending…' : 'Send message'}
          >
            {isSending ? <span className="chat-send-spinner" aria-hidden="true" /> : <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M10.1 13.9 15 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
          </button>
        </form>
      </footer>
    </div>
  );
}

export default Chat;