import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import apiClient from '../api/apiClient';
import logger from '../utils/logger';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        try {
          const currentUser = await apiClient.get('/api/users/me');
          setUser(currentUser);
        } catch (error) {
          setUser(null);
          localStorage.removeItem("authToken");
        }
      }
      setIsLoading(false);
    };

    fetchCurrentUser();
  }, []);

  const login = async (token, userData = null) => {
    localStorage.setItem("authToken", token);
    logger.info("AuthContext: login called.", { token, userData });
    if (userData) {
      // If user object is provided directly (e.g., for superadmin), use it.
      setUser(userData);
      logger.info("AuthContext: User state set directly with provided data.", { userData });
    } else {
      // Otherwise, fetch from /me endpoint (standard flow)
      const currentUser = await apiClient.get('/api/users/me');
      setUser(currentUser);
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch (error) {
      logger.error('Logout failed:', error);
    } finally {
      setUser(null);
      localStorage.removeItem("authToken");
    }
  };

  const value = useMemo(() => ({
    user,
    setUser,
    isLoading,
    login,
    logout,
  }), [user, isLoading]);

  console.log("AuthContext value:", value);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
