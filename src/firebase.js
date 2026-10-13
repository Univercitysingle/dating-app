import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const projectId = process.env.REACT_APP_FIREBASE_PROJECT_ID;
const databaseURL =
  process.env.REACT_APP_FIREBASE_DATABASE_URL ||
  (projectId ? `https://${projectId}-default-rtdb.firebaseio.com` : undefined);

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || (projectId ? `${projectId}.firebaseapp.com` : undefined),
  projectId: projectId,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.appspot.com` : undefined),
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  ...(databaseURL ? { databaseURL } : {}),
};

import logger from "./utils/logger";

// Log the configuration to verify it's loaded, but be careful not to log sensitive keys.
logger.info("Firebase Config Loaded:", {
  projectId: firebaseConfig.projectId,
  authDomain: firebaseConfig.authDomain,
  appId: firebaseConfig.appId,
});

if (!firebaseConfig.apiKey) {
  logger.error("Firebase API Key is missing. Firebase will not initialize.");
}

// Only initialize if none exist
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);

let rtdb = null;
try {
  rtdb = getDatabase(app);
} catch (e) {
  // If offline or missing RTDB config, fallback gracefully
}
export const database = rtdb;

export default app;
