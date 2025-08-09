const admin = require('firebase-admin');

// Ensure required env variables are set
if (
  !process.env.FIREBASE_PROJECT_ID ||
  !process.env.FIREBASE_CLIENT_EMAIL ||
  !process.env.FIREBASE_PRIVATE_KEY
) {
  throw new Error(
    'Missing Firebase environment variables. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.'
  );
}

// Construct the service account object from env
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY ? JSON.parse(`"${process.env.FIREBASE_PRIVATE_KEY}"`) : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  token_uri: "https://oauth2.googleapis.com/token",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
};

// Avoid re-initialization in dev/hot-reload environments
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

module.exports = admin;
