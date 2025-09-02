import React, { createContext, useContext, useState, useEffect } from 'react';
import apiClient from '../api/apiClient';
import logger from '../utils/logger';
import { processUserProfile } from '../utils/userProfileProcessor';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // New function to process user before setting state
  const processAndSetUser = (newUser) => {
    if (newUser) {
      const processedUser = processUserProfile(newUser);
      setUser(processedUser);
    } else {
      setUser(null);
    }
  };

  useEffect(() => {
    const fetchCurrentUser = async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        try {
          const currentUser = await apiClient.get('/api/users/me');
          processAndSetUser(currentUser); // Use the new function
        } catch (error) {
          processAndSetUser(null); // Use the new function
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
      processAndSetUser(userData); // Use the new function
      logger.info("AuthContext: User state set directly with provided data.", { userData });
    } else {
      // Otherwise, fetch from /me endpoint (standard flow)
      const currentUser = await apiClient.get('/api/users/me');
      processAndSetUser(currentUser); // Use the new function
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/api/auth/logout');
    } catch (error) {
      logger.error('Logout failed:', error);
    } finally {
      processAndSetUser(null); // Use the new function
      localStorage.removeItem("authToken");
    }
  };

  const value = {
    user,
    setUser: processAndSetUser, // Export the wrapped function
    isLoading,
    login,
    logout,
  };

  console.log("AuthContext value:", value);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
