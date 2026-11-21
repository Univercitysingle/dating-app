const mongoose = require('mongoose');

const supportTicketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  ticketNumber: {
    type: String,
    required: true,
    unique: true,
  },
  subject: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Waiting for Customer', 'Closed'],
    default: 'Open',
  },
  priority: {
    type: String,
    enum: ['Urgent', 'High', 'Normal', 'Low'],
    default: 'Normal',
  },
  category: {
    type: String,
    enum: ['Account', 'Payments', 'Profile', 'Verification', 'Safety', 'Technical', 'Other'],
    default: 'Other',
  },
  assignedToUid: {
    type: String,
    default: '',
    trim: true,
  },
  resolutionSummary: {
    type: String,
    default: '',
    maxlength: 2000,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
