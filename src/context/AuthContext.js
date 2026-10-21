import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getAuth, onIdTokenChanged } from 'firebase/auth';
import app from '../firebase'; // Import your Firebase app instance
import apiClient from '../api/apiClient';
import logger from '../utils/logger';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastUid = useRef(null);

  // Avoid logging the full user profile or authentication credentials.

  useEffect(() => {
    logger.info("AuthContext: Setting up Firebase onIdTokenChanged listener.");
    const auth = getAuth(app);
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      logger.info("AuthContext: onIdTokenChanged event fired.");
      if (firebaseUser) {
        logger.info(`AuthContext: Firebase user detected (UID: ${firebaseUser.uid}).`);
        const token = await firebaseUser.getIdToken();
        localStorage.setItem("authToken", token);

        if (firebaseUser.uid !== lastUid.current) {
          logger.info(`AuthContext: User ID changed from ${lastUid.current} to ${firebaseUser.uid}. Fetching profile.`);
          try {
            const currentUser = await apiClient.get('/users/me');
            logger.info("AuthContext: Successfully fetched user profile.");
            setUser(currentUser);
            lastUid.current = firebaseUser.uid;
          } catch (error) {
            logger.error("AuthContext: Failed to fetch user on token change. Signing out.", { error });
            setUser(null);
            localStorage.removeItem("authToken");
            lastUid.current = null;
            await auth.signOut();
          }
        } else {
          logger.info(`AuthContext: User ID is the same (${firebaseUser.uid}). Skipping profile fetch.`);
        }
      } else {
        logger.info("AuthContext: No Firebase user. Clearing user state.");
        setUser(null);
        localStorage.removeItem("authToken");
        lastUid.current = null;
      }
      logger.info("AuthContext: Finished processing onIdTokenChanged event. Setting isLoading to false.");
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []); // Empty dependency array to run only once on mount

  const login = useCallback(async (token, userData = null) => {
    localStorage.setItem("authToken", token);
    logger.info("AuthContext: login called.", { hasToken: Boolean(token), hasUserData: Boolean(userData) });
    if (userData) {
      setUser(userData);
      lastUid.current = userData.uid;
      logger.info("AuthContext: User state set directly with provided data.");
    } else {
      try {
        const currentUser = await apiClient.get('/users/me');
        setUser(currentUser);
        lastUid.current = currentUser.uid;
      } catch (error) {
        logger.error("Failed to fetch user on login:", error);
        setUser(null);
        localStorage.removeItem("authToken");
        lastUid.current = null;
      }
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      logger.error('Logout failed:', error);
    } finally {
      const auth = getAuth(app);
      await auth.signOut(); // Sign out from Firebase
      setUser(null);
      localStorage.removeItem("authToken");
      lastUid.current = null;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    setUser,
    isLoading,
    login,
    logout,
  }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
