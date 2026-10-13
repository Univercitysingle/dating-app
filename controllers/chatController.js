const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User');
const { sanitizeUser } = require('../utils/userUtils');

/**
 * Checks if a user is a super admin or a participant in a chat.
 * @param {string} userId - The ID of the user.
 * @param {string} roomId - The ID of the room.
 * @returns {Promise<boolean>} - True if the user can view chat history, false otherwise.
 */
async function canViewChatHistory(userId, roomId) {
  try {
    const user = await User.findOne({ uid: userId });
    if (user && user.role === 'superadmin') {
      return true; // Super admin can access any chat history
    }
    const participants = roomId.split('-');
    if (participants.includes(userId)) {
      return true;
    }

    return false;
  } catch (error) {
    console.error('Error in canViewChatHistory:', error);
    return false;
  }
};

const getChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user.uid; // UID from auth middleware

    // Authorization check
    const canView = await canViewChatHistory(userId, roomId);
    if (!canView) {
      return res.status(403).json({ error: "Unauthorized to view this chat history." });
    }

    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;

    const messages = await ChatMessage.find({ roomId })
      .sort({ timestamp: 1 })
      .skip(skip)
      .limit(limit)
      .exec();

    res.json({
      messages,
    });
    console.log(`Successfully retrieved chat history for room: ${roomId}`);
  } catch (error) {
    console.error(`Error fetching chat history for room ${req.params.roomId}:`, error);
    res.status(500).json({ error: "An unexpected error occurred while fetching chat history." });
  }
};

const getConversations = async (req, res) => {
  const log = req.log || console;
  const userId = req.user.uid;
  log.info("chatController:getConversations: Entered.", { userId });
  try {
    // Find all unique roomIds for the user
    const rooms = await ChatMessage.distinct('roomId', {
      $or: [{ senderUid: userId }, { receiverUid: userId }],
    });
    log.info(`chatController:getConversations: Found ${rooms.length} distinct rooms.`);

    const conversations = await Promise.all(
      rooms.map(async (roomId) => {
        const participants = roomId.split('-');
        const otherUserId = participants.find((p) => p !== userId);

        if (!otherUserId) return null;

        const otherUser = await User.findOne({ uid: otherUserId }).select('name photos age bio').lean();
        if (!otherUser) return null;

        const lastMessage = await ChatMessage.findOne({ roomId }).sort({ timestamp: -1 });

        return {
          roomId,
          otherUser: sanitizeUser(otherUser, req.user),
          lastMessage,
        };
      })
    );

    const validConversations = conversations.filter(c => c !== null);

    // Sort conversations by the timestamp of the last message
    validConversations.sort((a, b) => {
        if (!a.lastMessage) return 1;
        if (!b.lastMessage) return -1;
        return b.lastMessage.timestamp - a.lastMessage.timestamp;
    });

    res.json(validConversations);
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: 'An unexpected error occurred while fetching conversations.' });
  }
};

const sendMessageHttp = async (req, res) => {
  try {
    const senderUid = req.user.uid;
    const { roomId, messageContent, receiverUid } = req.body;

    if (!roomId || !messageContent || !receiverUid) {
      return res.status(400).json({ error: "Missing roomId, messageContent, or receiverUid." });
    }

    const chatMessage = new ChatMessage({
      roomId,
      senderUid,
      receiverUid,
      messageContent,
    });
    await chatMessage.save();

    const messagePayload = {
      _id: chatMessage._id,
      roomId: chatMessage.roomId,
      senderUid: chatMessage.senderUid,
      receiverUid: chatMessage.receiverUid,
      messageContent: chatMessage.messageContent,
      timestamp: chatMessage.timestamp,
    };

    // Sync to Firebase Realtime Database
    try {
      const { syncChatMessageToFirebase } = require('../services/firebaseRealtimeService');
      await syncChatMessageToFirebase(roomId, messagePayload);
    } catch (fbErr) {
      console.warn('Firebase sync warning:', fbErr.message);
    }

    // Emit via Socket.io if active
    try {
      const { getIO } = require('../services/socket');
      const io = getIO();
      if (io) {
        io.to(roomId).emit("message", messagePayload);
      }
    } catch (ioErr) {
      // socket.io not initialized
    }

    res.status(201).json(messagePayload);
  } catch (error) {
    console.error("Error sending chat message via HTTP:", error);
    res.status(500).json({ error: "Failed to send chat message." });
  }
};

module.exports = {
  getChatHistory,
  canViewChatHistory,
  getConversations,
  sendMessageHttp,
};

