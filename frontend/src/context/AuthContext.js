import React, { createContext, useContext, useState, useEffect } from "react";
import { getAuth, signInWithCustomToken, onAuthStateChanged } from "firebase/auth";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
};
initializeApp(firebaseConfig);

const auth = getAuth();

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // Will store full user profile from our backend
  const [isLoading, setIsLoading] = useState(true); // For initial auth state check
  const [tempAuthInfo, setTempAuthInfo] = useState(null); // For password setup flow

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken();
          // At this point, we have a Firebase user.
          // We need to fetch our backend's user profile.
          // This is usually done after login or on app load.
          // For now, we'll assume login flow populates our backend user.
          // If a user is already logged into Firebase but we don't have their full profile,
          // we might need a mechanism to fetch it here or prompt re-login.

          // Let's try to get user from localStorage first, assuming login flow has put it there.
          const idToken = await firebaseUser.getIdToken(); // This is the fresh Firebase ID token

          // Try to get existing app user details from localStorage to preserve them
          const storedAppUserString = localStorage.getItem('appUser');
          let otherUserDetails = {};
          if (storedAppUserString) {
            try {
              const parsedStoredAppUser = JSON.parse(storedAppUserString);
              if (parsedStoredAppUser.uid === firebaseUser.uid) {
                // Only keep other details if UID matches, exclude old tokens
                const { token, firebaseIdToken, ...rest } = parsedStoredAppUser;
                otherUserDetails = rest;
              }
            } catch (e) {
              console.error("Error parsing stored appUser during onAuthStateChanged:", e);
              // Potentially corrupted data, clear it
              localStorage.removeItem('appUser');
            }
          }

          // Construct the user object for context and localStorage
          const appUserToStore = {
            ...otherUserDetails, // Persist other details like name, backend-specific roles etc.
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            token: idToken, // THIS IS THE KEY CHANGE: Use fresh Firebase ID token for backend auth
            firebaseIdToken: idToken // Explicitly store firebase ID token if needed elsewhere
          };

          // Update localStorage so apiClient can pick up the fresh token
          localStorage.setItem('appUser', JSON.stringify(appUserToStore));

          // Update React context state
          setUser(appUserToStore);

        } catch (error) {
          console.error("Error in onAuthStateChanged processing:", error);
          setUser(null);
          localStorage.removeItem('appUser');
        }
      } else {
        // User is signed out from Firebase
        setUser(null);
        localStorage.removeItem('appUser');
        setTempAuthInfo(null); // Clear temp info on logout
      }
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Called from Login.js after /api/auth/login returns
  // backendUser: user object from our DB
  // firebaseTokenForSignIn: custom token from our backend to sign into Firebase client
  // backendApiToken: token to communicate with our protected backend routes (could be same as firebaseTokenForSignIn if it's a Firebase ID token)
  const handleLoginSuccess = (backendUser, firebaseTokenForSignIn, backendApiToken) => {
    localStorage.setItem('appUser', JSON.stringify({ ...backendUser, token: backendApiToken }));
    setUser({ ...backendUser, token: backendApiToken }); // Store full user profile + our API token

    // If Firebase client sign-in is needed with a custom token
    if (firebaseTokenForSignIn) {
      return signInWithCustomToken(auth, firebaseTokenForSignIn)
        .catch(error => {
          console.error("Firebase signInWithCustomToken error:", error);
          // Handle failed Firebase sign-in (e.g., clear appUser, setUser(null))
          localStorage.removeItem('appUser');
          setUser(null);
          throw error; // Re-throw to be caught by Login.js
        });
    }
    return Promise.resolve();
  };

  // Stores user data and token temporarily when password setup is required
  const setPendingPasswordSetup = (userInfo, apiToken) => {
    setTempAuthInfo({ user: userInfo, token: apiToken });
    // Optionally, persist to localStorage if user might refresh on SetInitialPasswordPage
    localStorage.setItem('tempAuthInfo', JSON.stringify({ user: userInfo, token: apiToken }));
  };

  // Called from SetInitialPasswordPage after successful password set
  const completePasswordSetupAndLogin = (backendUser, backendApiToken) => {
    setTempAuthInfo(null);
    localStorage.removeItem('tempAuthInfo');
    // Now proceed with full login using the (potentially updated) user info and token
    // This assumes the backendApiToken is what's needed for Firebase client sign-in *if* it's a custom token.
    // Or, if Firebase sign-in already happened, just update app state.
    handleLoginSuccess(backendUser, null, backendApiToken); // Pass null if Firebase sign-in not needed again
  };

  const logout = async () => {
    await auth.signOut(); // Firebase sign out
    setUser(null);
    localStorage.removeItem('appUser');
    localStorage.removeItem('tempAuthInfo');
    // any other cleanup
  };

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      handleLoginSuccess,
      setPendingPasswordSetup,
      tempAuthInfo,
      completePasswordSetupAndLogin,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
