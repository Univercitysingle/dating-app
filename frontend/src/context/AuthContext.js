import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import logger from '../utils/logger';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const currentUser = await apiClient.get('/api/users/me');
        setUser(currentUser);
      } catch (error) {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchCurrentUser();
  }, []);

  const login = async (token) => {
    // The backend will set the cookie upon successful login
    await apiClient.post('/api/auth/login', { token });
    // After login, fetch the user profile
    const currentUser = await apiClient.get('/api/users/me');
    setUser(currentUser);
  };

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout');
      setUser(null);
    } catch (error) {
      logger.error('Logout failed:', error);
    }
  };

  const value = {
    user,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
