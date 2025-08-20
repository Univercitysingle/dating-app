import * as admin from 'firebase-admin';
import { https } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';

const db = admin.firestore();

export const processLike = https.onCall(async (request) => {
    // 1. Authentication and Input Validation
    if (!request.auth) {
        throw new https.HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }
    const uid = request.auth.uid;

    const { targetUid } = request.data;
    if (!targetUid || typeof targetUid !== 'string') {
        throw new https.HttpsError('invalid-argument', 'A valid targetUid must be provided.');
    }

    if (uid === targetUid) {
        throw new https.HttpsError('invalid-argument', 'Users cannot like themselves.');
    }

    // 2. Define document references
    const likeDocRef = db.collection('swipes').doc(uid).collection('outgoing').doc(targetUid);
    const reciprocalLikeDocRef = db.collection('swipes').doc(targetUid).collection('outgoing').doc(uid);

    try {
        // 3. Run as a transaction to ensure atomicity
        await db.runTransaction(async (transaction) => {
            const reciprocalLikeDoc = await transaction.get(reciprocalLikeDocRef);

            // Always record the current user's like
            transaction.set(likeDocRef, { action: 'like', timestamp: FieldValue.serverTimestamp() });

            // 4. Check for a match
            if (reciprocalLikeDoc.exists) {
                console.log(`Match found between ${uid} and ${targetUid}`);

                const newMatchRef = db.collection('matches').doc(); // Create a new doc with a random ID

                transaction.set(newMatchRef, {
                    users: [uid, targetUid],
                    createdAt: FieldValue.serverTimestamp(),
                    lastMessageAt: FieldValue.serverTimestamp(), // Initialize with creation time
                    lastMessageText: 'You matched!',
                });

                // Optional: For cleanup, you might delete the swipe docs after a match is made
                // transaction.delete(likeDocRef);
                // transaction.delete(reciprocalLikeDocRef);
            }
        });

        return { success: true, matched: reciprocalLikeDocRef.id !== null }; // A bit of a guess on matched status, but it's a start

    } catch (error) {
        console.error(`Error processing like from ${uid} to ${targetUid}:`, error);
        throw new https.HttpsError('internal', 'An error occurred while processing the like.');
    }
});
