const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    senderUid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    receiverUid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    messageContent: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000, // prevent overly long messages
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
      index: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true, // auto-manages createdAt & updatedAt
    versionKey: false, // removes "__v"
  }
);

// Compound indexes for efficient queries
chatMessageSchema.index({ roomId: 1, timestamp: -1 });
chatMessageSchema.index({ senderUid: 1, receiverUid: 1, timestamp: -1 });

module.exports = mongoose.model('ChatMessage', chatMessageSchema);
