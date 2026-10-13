const admin = require('firebase-admin');

let serviceAccount = null;

// Strategy 1: Use FIREBASE_CREDENTIALS_BASE64 (full service account JSON, base64-encoded)
if (process.env.FIREBASE_CREDENTIALS_BASE64) {
  try {
    const decoded = Buffer.from(process.env.FIREBASE_CREDENTIALS_BASE64, 'base64').toString('utf8');
    serviceAccount = JSON.parse(decoded);
    // Fix escaped newlines in private_key
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
  } catch (e) {
    console.error('⚠️  Failed to parse FIREBASE_CREDENTIALS_BASE64:', e.message);
  }
}

// Strategy 2: Use individual env vars (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
if (!serviceAccount && process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  serviceAccount = {
    type: "service_account",
    project_id: process.env.FIREBASE_PROJECT_ID,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    token_uri: "https://oauth2.googleapis.com/token",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  };
}

if (!serviceAccount) {
  console.warn(
    '⚠️  Missing Firebase credentials. Set FIREBASE_CREDENTIALS_BASE64 or (FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY). Firebase Admin features will be unavailable.'
  );
  module.exports = null;
  return;
}

// Determine Firebase Realtime Database URL
const databaseURL =
  process.env.FIREBASE_DATABASE_URL ||
  (serviceAccount.project_id
    ? `https://${serviceAccount.project_id}-default-rtdb.firebaseio.com`
    : undefined);

// Avoid re-initialization in dev/hot-reload environments
if (!admin.apps.length) {
  const initOptions = {
    credential: admin.credential.cert(serviceAccount),
  };
  if (databaseURL) {
    initOptions.databaseURL = databaseURL;
  }
  admin.initializeApp(initOptions);
  console.log('✅ Firebase Admin SDK initialized successfully.');
}

module.exports = admin;