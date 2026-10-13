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
}, { timestamps: true });

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
