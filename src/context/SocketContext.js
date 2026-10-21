import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../utils/constants';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { database } from '../firebase';
import { ref, onChildAdded, off } from 'firebase/database';

const SocketContext = createContext(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [allMessages, setAllMessages] = useState({});
  const { user } = useAuth();
  const navigate = useNavigate();

  // Socket.IO is not available on the Cloudflare Workers API. Keep it enabled for
  // legacy deployments, but disable it explicitly for the serverless Pages build.
  useEffect(() => {
    if (process.env.REACT_APP_ENABLE_SOCKET === 'false') return;
    if (user && user.uid) {
      const token = localStorage.getItem("authToken");
      if (token) {
        let newSocket;
        try {
          newSocket = io(API_URL, {
            auth: {
              token: token,
            },
            transports: ['websocket', 'polling'],
            timeout: 10000,
          });
          setSocket(newSocket);

          const mergeOrDeduplicate = (roomMessages, newMessage) => {
            if (roomMessages.some(m => String(m._id) === String(newMessage._id))) {
              return roomMessages;
            }
            const optimisticIndex = roomMessages.findIndex(m =>
              m.senderUid === newMessage.senderUid &&
              m.messageContent === newMessage.messageContent &&
              (String(m._id).startsWith('temp_') || /^\d+$/.test(String(m._id)))
            );
            if (optimisticIndex !== -1) {
              const updated = [...roomMessages];
              updated[optimisticIndex] = newMessage;
              return updated;
            }
            return [...roomMessages, newMessage];
          };

          newSocket.on('message', (newMessage) => {
            setAllMessages(prevMessages => {
              const roomMessages = prevMessages[newMessage.roomId] || [];
              return {
                ...prevMessages,
                [newMessage.roomId]: mergeOrDeduplicate(roomMessages, newMessage),
              };
            });
          });

          newSocket.on('new_message_notification', (notification) => {
            toast.info(`New message from ${notification.senderUid}`, {
              onClick: () => {
                navigate(`/chat/${notification.roomId}`);
              },
            });
          });

          newSocket.on('chatHistory', ({ roomId, messages }) => {
            setAllMessages(prevMessages => ({
              ...prevMessages,
              [roomId]: messages,
            }));
          });
        } catch (err) {
          console.warn('Socket.IO connection attempt failed:', err);
        }

        return () => {
          if (newSocket) newSocket.close();
        };
      }
    }
  }, [user?.uid, navigate]);

  // Firebase Realtime Database Real-Time Notification Listener (Serverless Sync)
  useEffect(() => {
    if (user && user.uid && database) {
      let notifRef;
      try {
        notifRef = ref(database, `notifications/${user.uid}`);
        onChildAdded(notifRef, (snapshot) => {
          const notif = snapshot.val();
          if (notif && notif.type === 'match') {
            toast.success('🎉 You have a new match!');
          } else if (notif && notif.type === 'like') {
            toast.info('Someone liked your profile!');
          }
        });
      } catch (fbErr) {
        console.warn('Firebase RTDB notification listener error:', fbErr);
      }

      return () => {
        if (notifRef) {
          try {
            off(notifRef);
          } catch (e) {
            // Ignored
          }
        }
      };
    }
  }, [user?.uid]);

  const addMessage = (newMessage) => {
    setAllMessages(prevMessages => {
      const roomMessages = prevMessages[newMessage.roomId] || [];
      if (roomMessages.some(m => String(m._id) === String(newMessage._id))) {
        return prevMessages;
      }
      const optimisticIndex = roomMessages.findIndex(m =>
        m.senderUid === newMessage.senderUid &&
        m.messageContent === newMessage.messageContent &&
        (String(m._id).startsWith('temp_') || /^\d+$/.test(String(m._id)))
      );
      if (optimisticIndex !== -1) {
        const updated = [...roomMessages];
        updated[optimisticIndex] = newMessage;
        return {
          ...prevMessages,
          [newMessage.roomId]: updated,
        };
      }
      return {
        ...prevMessages,
        [newMessage.roomId]: [...roomMessages, newMessage],
      };
    });
  };

  return (
    <SocketContext.Provider value={{ socket, allMessages, addMessage }}>
      {children}
    </SocketContext.Provider>
  );
};
