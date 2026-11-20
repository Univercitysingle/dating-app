const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  ticketId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'SupportTicket',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  isFromAdmin: {
    type: Boolean,
    default: false,
  },
  isInternalNote: {
    type: Boolean,
    default: false,
  },
  editedAt: {
    type: Date,
    default: null,
  },
  deletedMessage: {
    type: String,
    default: null,
    select: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  attachments: [{
    key: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, default: '' },
    url: { type: String, required: true },
  }],
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('TicketMessage', ticketMessageSchema);
