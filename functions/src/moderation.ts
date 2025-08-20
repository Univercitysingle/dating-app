import * as admin from 'firebase-admin';
import { https } from 'firebase-functions/v2';

const db = admin.firestore();

export const moderateImage = https.onCall(async (request) => {
    // 1. Authentication and Input Validation
    if (!request.auth) {
        // In a real app, you might also allow this to be called by a service account
        // if it were triggered by a storage event instead of being a callable function.
        throw new https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const { key } = request.data;
    if (!key || typeof key !== 'string') {
        throw new https.HttpsError('invalid-argument', 'A valid object key must be provided.');
    }

    // Key is expected in the format 'users/{uid}/{uuid}.jpg'
    const keyParts = key.split('/');
    if (keyParts.length !== 3 || keyParts[0] !== 'users') {
        throw new https.HttpsError('invalid-argument', 'Invalid key format. Expected "users/{uid}/{filename}".');
    }
    const uid = keyParts[1];

    // 2. NSFW Classification (Placeholder)
    // In a real implementation, this would involve calling a service like the
    // Google Cloud Vision API, Sightengine, or another NSFW detection service.
    console.log(`Moderating image with key: ${key}`);
    const isExplicit = Math.random() > 0.9; // 10% chance of being flagged as explicit for demonstration

    // 3. Update Firestore with the moderation result
    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();

        if (userData && Array.isArray(userData.photos)) {
            // Find the photo in the array and update its status
            const updatedPhotos = userData.photos.map(photo => {
                if (photo.key === key) {
                    return {
                        ...photo,
                        moderation: {
                            status: isExplicit ? 'rejected' : 'approved',
                            reason: isExplicit ? 'explicit_content' : null,
                            moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        }
                    };
                }
                return photo;
            });
            await userRef.update({ photos: updatedPhotos });
        }

        console.log(`Image ${key} moderation result: ${isExplicit ? 'rejected' : 'approved'}`);
        return { status: isExplicit ? 'rejected' : 'approved' };

    } catch (error) {
        console.error(`Error updating moderation status for key ${key}:`, error);
        throw new https.HttpsError('internal', 'Failed to update image moderation status.');
    }
});
