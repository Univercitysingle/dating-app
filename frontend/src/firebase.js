import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

// DEBUG: Log your env variables
console.log("FIREBASE API KEY:", process.env.REACT_APP_FIREBASE_API_KEY);
console.log("FIREBASE MESSAGING SENDER ID:", process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID);
console.log("FIREBASE APP ID:", process.env.REACT_APP_FIREBASE_APP_ID);

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: "it-services-1841e.firebaseapp.com",
  projectId: "it-services-1841e",
  storageBucket: "it-services-1841e.appspot.com",
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Only initialize if none exist
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

export default app;
