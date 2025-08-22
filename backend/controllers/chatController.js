const ChatMessage = require('../models/ChatMessage');

const getChatHistory = async (req, res) => {
  try {
    const { roomId } = req.params;
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
};
