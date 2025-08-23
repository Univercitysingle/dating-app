import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import apiClient from "../api/apiClient";
import logger from "../utils/logger";

const AuthContext = createContext();

/**
 * Provides authentication state and methods across the app
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // -------------------- FETCH CURRENT USER --------------------
  const fetchCurrentUser = useCallback(async () => {
    setIsLoading(true);
    try {
      const currentUser = await apiClient.get("/api/users/me");
      setUser(currentUser);
      logger.info("✅ Auth: Current user fetched", currentUser);
    } catch (error) {
      setUser(null);
      logger.warn("⚠️ Auth: No active session or fetch user failed", {
        message: error.message,
        status: error.status,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Run once on mount
  useEffect(() => {
    fetchCurrentUser();
  }, [fetchCurrentUser]);

  // -------------------- LOGIN --------------------
  const login = async (token) => {
    try {
      logger.debug("➡️ Auth: Attempting login with token");

      // Save JWT token to localStorage (so apiClient can attach it)
      localStorage.setItem("authToken", token);

      // Fetch user profile after saving token
      const currentUser = await apiClient.get("/api/users/me");
      setUser(currentUser);

      logger.info("✅ Auth: Login successful", currentUser);
      return currentUser;
    } catch (error) {
      logger.error("❌ Auth: Login failed", {
        message: error.message,
        status: error.status,
      });
      throw error;
    }
  };

  // -------------------- LOGOUT --------------------
  const logout = async () => {
    try {
      logger.debug("➡️ Auth: Attempting logout...");
      // optional: notify backend if you have a logout endpoint
      await apiClient.post("/api/auth/logout").catch(() => {});

      // Remove token locally
      localStorage.removeItem("authToken");
      setUser(null);

      logger.info("✅ Auth: Logout successful");
    } catch (error) {
      logger.error("❌ Auth: Logout failed", {
        message: error.message,
        status: error.status,
      });
    }
  };

  // -------------------- CONTEXT VALUE --------------------
  const value = {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser: fetchCurrentUser, // expose manual refresh
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Hook for consuming auth context
export function useAuth() {
  return useContext(AuthContext);
}
