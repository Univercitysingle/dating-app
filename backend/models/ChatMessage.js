const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    index: true,
  },
  senderUid: {
    type: String,
    required: true,
    index: true,
  },
  receiverUid: {
    type: String,
    required: true,
    index: true,
  },
  messageContent: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
