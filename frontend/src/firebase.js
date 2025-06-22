import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

// DEBUG: Remove or comment out in production!
console.log("FIREBASE API KEY:", process.env.REACT_APP_FIREBASE_API_KEY);
console.log("FIREBASE MESSAGING SENDER ID:", process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID);
console.log("FIREBASE APP ID:", process.env.REACT_APP_FIREBASE_APP_ID);

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN, // Use env for consistency!
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Only initialize if none exist
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export default app;
