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
  const [user, setUser] = useState(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        firebaseUser.getIdToken().then(token => {
          setUser({ uid: firebaseUser.uid, token, email: firebaseUser.email });
          localStorage.setItem("user", JSON.stringify({ uid: firebaseUser.uid, token, email: firebaseUser.email }));
        });
      } else {
        setUser(null);
        localStorage.removeItem("user");
      }
    });
  }, []);

  const loginWithCustomToken = (token) => signInWithCustomToken(auth, token);

  return (
    <AuthContext.Provider value={{ user, loginWithCustomToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
