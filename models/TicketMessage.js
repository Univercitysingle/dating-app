const mongoose = require('mongoose');

const ticketMessageSchema = new mongoose.Schema({
  ticketId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupportTicket', required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true, maxlength: 5000 },
  isFromAdmin: { type: Boolean, default: false },
  isInternalNote: { type: Boolean, default: false, index: true },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  originalMessage: { type: String, default: null, select: false },
}, { timestamps: true });

ticketMessageSchema.index({ ticketId: 1, createdAt: 1 });

module.exports = mongoose.model('TicketMessage', ticketMessageSchema);
