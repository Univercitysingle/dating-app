const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');

const getAllTickets = async (req, res) => {
  const { page: rawPage = '1', limit: rawLimit = '10', status } = req.query;
  const validStatuses = SupportTicket.schema.path('status').enumValues;

  // Never pass an object or operator supplied through query parameters into a
  // MongoDB filter. Only the schema's explicit status values are accepted.
  if (status !== undefined && (typeof status !== 'string' || !validStatuses.includes(status))) {
    return res.status(400).json({ message: 'Invalid ticket status.' });
  }

  const pageValue = typeof rawPage === 'string' && /^\d{1,6}$/.test(rawPage) ? Number(rawPage) : 1;
  const limitValue = typeof rawLimit === 'string' && /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : 10;
  const page = Math.min(Math.max(pageValue, 1), 10000);
  const limit = Math.min(Math.max(limitValue, 1), 100);

  try {
    const query = {};
    if (status !== undefined) query.status = status;

    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: 'desc' })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await SupportTicket.countDocuments(query);

    res.json({
      tickets,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
    });
  } catch (error) {
    console.error('Error fetching all support tickets:', error);
    res.status(500).json({ message: 'Error fetching all support tickets', error: error.message });
  }
};

const getTicketByIdForAdmin = async (req, res) => {
  const { ticketId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    return res.status(400).json({ message: 'Invalid ticket ID.' });
  }

  try {
    const ticket = await SupportTicket.findById(ticketId).populate('userId', 'name email');

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const messages = await TicketMessage.find({ ticketId }).sort({ createdAt: 'asc' }).populate('senderId', 'name');

    res.json({ ticket, messages });
  } catch (error) {
    console.error('Error fetching ticket details for admin:', error);
    res.status(500).json({ message: 'Error fetching ticket details for admin', error: error.message });
  }
};

const addAdminMessageToTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { message, isInternalNote = false } = req.body || {};
  const adminUserId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    return res.status(400).json({ message: 'Invalid ticket ID.' });
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const newMessage = new TicketMessage({
      ticketId,
      senderId: adminUserId,
      message: message.trim(),
      isFromAdmin: true,
      isInternalNote: isInternalNote === true,
    });

    await newMessage.save();

    // Internal notes never change customer-facing ticket state.
    if (!newMessage.isInternalNote) {
      ticket.status = 'Waiting for Customer';
      await ticket.save();
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error adding admin message to ticket:', error);
    res.status(500).json({ message: 'Error adding admin message to ticket', error: error.message });
  }
};

const updateTicketStatus = async (req, res) => {
  const { ticketId } = req.params;
  const { status } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    return res.status(400).json({ message: 'Invalid ticket ID.' });
  }
  const validStatuses = SupportTicket.schema.path('status').enumValues;
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    return res.status(400).json({ message: 'Invalid ticket status.' });
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    ticket.status = status;
    await ticket.save();

    res.json(ticket);
  } catch (error) {
    console.error('Error updating ticket status:', error);
    res.status(500).json({ message: 'Error updating ticket status', error: error.message });
  }
};

module.exports = {
  getAllTickets,
  getTicketByIdForAdmin,
  addAdminMessageToTicket,
  updateTicketStatus,
};
