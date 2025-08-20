import * as admin from 'firebase-admin';
import { setGlobalOptions } from 'firebase-functions/v2';

// Initialize Firebase Admin SDK.
// This should only be done once per application lifecycle.
admin.initializeApp();

// Set global options for all functions (e.g., region).
// This can be configured via environment variables as well.
setGlobalOptions({ region: 'us-central1' });

// Import and export functions from their individual modules
// for better organization.
export { createSignedUploadUrl } from './b2';
export { processLike } from './swipes';
export { getFeed } from './feed';
export { moderateImage } from './moderation';
