import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { API_URL } from '../utils/constants';

const SocketContext = createContext(null);

export const useSocket = () => {
  return useContext(SocketContext);
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [allMessages, setAllMessages] = useState({});
  const { user } = useAuth();

  useEffect(() => {
    if (user && user.uid) {
      const token = localStorage.getItem("authToken");
      if (token) {
        const newSocket = io(API_URL, {
          auth: {
            token: token,
          },
        });
        setSocket(newSocket);

        newSocket.on('message', (newMessage) => {
          setAllMessages(prevMessages => {
            const roomMessages = prevMessages[newMessage.roomId] || [];
            if (roomMessages.some(m => m._id === newMessage._id)) {
              return prevMessages;
            }
            return {
              ...prevMessages,
              [newMessage.roomId]: [...roomMessages, newMessage],
            };
          });
        });

        return () => newSocket.close();
      }
    }
  }, [user?.uid]);

  const addMessage = (newMessage) => {
    setAllMessages(prevMessages => {
        const roomMessages = prevMessages[newMessage.roomId] || [];
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
