const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipientUid: {
    type: String,
    required: true,
    index: true,
  },
  senderUid: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['like', 'superlike', 'match'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'read', 'accepted', 'declined'],
    default: 'pending',
  },
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
