const ChatMessage = require('../models/ChatMessage');
const User = require('../models/User'); // Ensure User model is imported

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

module.exports = {
  getChatHistory,
  canViewChatHistory,
};
