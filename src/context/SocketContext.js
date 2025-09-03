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

        return () => newSocket.close();
      }
    }
  }, [user?.uid]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};
