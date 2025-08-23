const admin = require("firebase-admin");
const { globalLogger: logger } = require("../utils/logger"); // assuming same logger setup

// -------------------- VALIDATE ENV --------------------
const requiredEnvVars = [
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
];

const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

if (missingVars.length > 0) {
  logger.error("❌ Firebase Admin initialization failed: Missing env vars", {
    missing: missingVars,
  });
  throw new Error(
    `Missing Firebase environment variables: ${missingVars.join(", ")}`
  );
}

// -------------------- SERVICE ACCOUNT CONFIG --------------------
let serviceAccount;
try {
  serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    token_uri: "https://oauth2.googleapis.com/token",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    auth_provider_x509_cert_url:
      "https://www.googleapis.com/oauth2/v1/certs",
  };
} catch (err) {
  logger.error("❌ Failed to construct Firebase service account", {
    error: err.message,
  });
  throw err;
}

// -------------------- INITIALIZE --------------------
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    logger.info("✅ Firebase Admin initialized successfully.");
  } else {
    logger.debug("ℹ️ Firebase Admin already initialized, reusing existing app.");
  }
} catch (err) {
  logger.error("❌ Firebase Admin initialization error", {
    error: err.message,
    stack: err.stack,
  });
  throw err;
}

module.exports = admin;
