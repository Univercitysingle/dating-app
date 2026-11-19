import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getAuth, onIdTokenChanged } from 'firebase/auth';
import app from '../firebase';
import apiClient from '../api/apiClient';
import logger from '../utils/logger';

const AuthContext = createContext();

async function removeBrowserPushSubscription() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) ||
      typeof window === 'undefined' || !('PushManager' in window)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    try {
      await apiClient.delete('/push/subscriptions', { endpoint: subscription.endpoint });
    } catch (error) {
      logger.warn('Server-side push subscription cleanup failed during logout.', {
        message: error?.message || 'Push cleanup request failed'
      });
    }
    try {
      await subscription.unsubscribe();
    } catch (error) {
      logger.warn('Browser push subscription cleanup failed during logout.', {
        message: error?.message || 'Browser unsubscribe failed'
      });
    }
  } catch (error) {
    logger.warn('Browser push subscription lookup failed during logout.', {
      message: error?.message || 'Push subscription lookup failed'
    });
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const lastUid = useRef(null);

  useEffect(() => {
    const auth = getAuth(app);
    let active = true;

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (!active) return;
      setIsLoading(true);

      try {
        if (!firebaseUser) {
          await removeBrowserPushSubscription();
          setUser(null);
          localStorage.removeItem('authToken');
          lastUid.current = null;
          return;
        }

        const token = await firebaseUser.getIdToken();
        if (!active) return;
        localStorage.setItem('authToken', token);

        if (firebaseUser.uid === lastUid.current) return;

        try {
          const currentUser = await apiClient.get('/users/me');
          if (!active) return;
          setUser(currentUser);
          lastUid.current = firebaseUser.uid;
        } catch (error) {
          if (!active) return;
          logger.error('Unable to load profile during Firebase session restoration.', {
            status: error?.status || null,
            message: error?.message || 'Profile request failed'
          });

          // A temporary API, database, or permission failure is not proof that
          // the Firebase session is invalid. Only a 401 invalidates the session.
          if (error?.status === 401) {
            setUser(null);
            localStorage.removeItem('authToken');
            lastUid.current = null;
            try {
              await auth.signOut();
            } catch (signOutError) {
              logger.warn('Firebase sign-out after an unauthorized profile response failed.', {
                message: signOutError?.message || 'Sign-out failed'
              });
            }
          } else {
            lastUid.current = null;
          }
        }
      } catch (error) {
        // Token refresh/network errors should not silently destroy a valid
        // Firebase session. A subsequent token event can retry profile loading.
        logger.warn('Firebase session restoration failed.', {
          message: error?.message || 'Session restoration failed'
        });
      } finally {
        if (active) setIsLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (token, userData = null) => {
    if (token) localStorage.setItem('authToken', token);
    logger.info('AuthContext: login called.', {
      hasToken: Boolean(token),
      hasUserData: Boolean(userData)
    });

    if (userData) {
      setUser(userData);
      lastUid.current = userData.uid || getAuth(app).currentUser?.uid || null;
      return userData;
    }

    try {
      const currentUser = await apiClient.get('/users/me');
      setUser(currentUser);
      lastUid.current = currentUser.uid || getAuth(app).currentUser?.uid || null;
      return currentUser;
    } catch (error) {
      logger.error('Unable to load profile after login.', {
        status: error?.status || null,
        message: error?.message || 'Profile request failed'
      });

      if (error?.status === 401) {
        localStorage.removeItem('authToken');
        lastUid.current = null;
        try {
          await getAuth(app).signOut();
        } catch (signOutError) {
          logger.warn('Firebase sign-out after an unauthorized login response failed.', {
            message: signOutError?.message || 'Sign-out failed'
          });
        }
      }

      // Let the login screen handle the failure instead of navigating as if
      // authentication and profile initialization both succeeded.
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    await removeBrowserPushSubscription();
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      logger.warn('API logout request failed; clearing the local Firebase session anyway.', {
        message: error?.message || 'Logout request failed'
      });
    } finally {
      try {
        await getAuth(app).signOut();
      } catch (error) {
        logger.warn('Firebase sign-out failed.', {
          message: error?.message || 'Sign-out failed'
        });
      } finally {
        setUser(null);
        localStorage.removeItem('authToken');
        lastUid.current = null;
      }
    }
  }, []);

  const value = useMemo(() => ({
    user,
    setUser,
    isLoading,
    login,
    logout
  }), [user, isLoading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
