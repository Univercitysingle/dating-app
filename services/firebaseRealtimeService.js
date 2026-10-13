const { globalLogger: logger } = require('../utils/logger');

let admin;
try {
  admin = require('./firebaseAdmin');
} catch (err) {
  logger.warn('Firebase Admin not available for Realtime Service.');
}

/**
 * Sync a chat message to Firebase Realtime Database
 * @param {string} roomId
 * @param {object} messagePayload
 */
async function syncChatMessageToFirebase(roomId, messagePayload) {
  if (!admin || !admin.apps.length) return null;

  try {
    const db = admin.database();
    const sanitizedId = String(messagePayload._id || Date.now());
    const chatRef = db.ref(`chats/${roomId}/${sanitizedId}`);

    await chatRef.set({
      _id: sanitizedId,
      roomId,
      senderUid: messagePayload.senderUid,
      receiverUid: messagePayload.receiverUid,
      messageContent: messagePayload.messageContent,
      timestamp: messagePayload.timestamp || new Date().toISOString(),
    });

    logger.debug(`Synced chat message ${sanitizedId} to Firebase RTDB for room ${roomId}`);
    return true;
  } catch (err) {
    logger.warn('Failed to sync chat message to Firebase Realtime Database:', {
      error: err.message,
    });
    return false;
  }
}

/**
 * Sync a user notification to Firebase Realtime Database
 * @param {string} recipientUid
 * @param {object} notificationPayload
 */
async function syncNotificationToFirebase(recipientUid, notificationPayload) {
  if (!admin || !admin.apps.length || !recipientUid) return null;

  try {
    const db = admin.database();
    const sanitizedId = String(notificationPayload._id || Date.now());
    const notifRef = db.ref(`notifications/${recipientUid}/${sanitizedId}`);

    await notifRef.set({
      _id: sanitizedId,
      recipientUid,
      senderUid: notificationPayload.senderUid || '',
      type: notificationPayload.type || 'general',
      message: notificationPayload.message || '',
      createdAt: notificationPayload.createdAt || new Date().toISOString(),
    });

    logger.debug(`Synced notification ${sanitizedId} to Firebase RTDB for user ${recipientUid}`);
    return true;
  } catch (err) {
    logger.warn('Failed to sync notification to Firebase Realtime Database:', {
      error: err.message,
    });
    return false;
  }
}

module.exports = {
  syncChatMessageToFirebase,
  syncNotificationToFirebase,
};
