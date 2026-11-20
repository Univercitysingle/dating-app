const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');
const { v4: uuidv4 } = require('uuid');

const createTicket = async (req, res) => {
  const { subject, message } = req.body || {};
  const userId = req.user._id;

  if (typeof subject !== 'string' || !subject.trim() || subject.trim().length > 150) {
    return res.status(400).json({ message: 'Subject must be between 1 and 150 characters.' });
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });
  }

  try {
    const ticketNumber = uuidv4();

    const newTicket = new SupportTicket({
      userId,
      subject: subject.trim(),
      ticketNumber,
    });

    await newTicket.save();

    const newMessage = new TicketMessage({
      ticketId: newTicket._id,
      senderId: userId,
      message: message.trim(),
    });

    await newMessage.save();

    res.status(201).json(newTicket);
  } catch (error) {
    console.error('Error creating support ticket:', error);
    res.status(500).json({ message: 'Error creating support ticket', error: error.message });
  }
};

const getTicketsForUser = async (req, res) => {
  const userId = req.user._id;

  try {
    const tickets = await SupportTicket.find({ userId }).sort({ createdAt: 'desc' });
    res.json(tickets);
  } catch (error) {
    console.error('Error fetching user tickets:', error);
    res.status(500).json({ message: 'Error fetching user tickets', error: error.message });
  }
};

const getTicketByIdForUser = async (req, res) => {
  const { ticketId } = req.params;
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    return res.status(400).json({ message: 'Invalid ticket ID.' });
  }

  try {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const messages = await TicketMessage.find({ ticketId, isInternalNote: { $ne: true } }).select('-deletedMessage').sort({ createdAt: 'asc' }).populate('senderId', 'name');

    res.json({ ticket, messages });
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    res.status(500).json({ message: 'Error fetching ticket details', error: error.message });
  }
};

const addMessageToTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body || {};
  const userId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    return res.status(400).json({ message: 'Invalid ticket ID.' });
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });
  }

  try {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (ticket.status === 'Closed') {
      return res.status(403).json({ message: 'This ticket is closed and cannot be updated.' });
    }

    const newMessage = new TicketMessage({
      ticketId,
      senderId: userId,
      message: message.trim(),
    });

    await newMessage.save();

    // Update ticket status
    ticket.status = 'In Progress';
    await ticket.save();

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error adding message to ticket:', error);
    res.status(500).json({ message: 'Error adding message to ticket', error: error.message });
  }
};


const editOwnTicketMessage = async (req, res) => {
  const { ticketId, messageId } = req.params;
  const { message } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({ message: 'Invalid ticket or message ID.' });
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });
  }
  try {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId: req.user._id });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const cutoff = new Date(Date.now() - 15 * 60 * 1000);
    const updated = await TicketMessage.findOneAndUpdate({
      _id: messageId, ticketId, senderId: req.user._id,
      isFromAdmin: false, isInternalNote: false, deletedAt: null,
      createdAt: { $gte: cutoff },
    }, { $set: { message: message.trim(), editedAt: new Date() } }, { new: true, runValidators: true });
    if (!updated) return res.status(403).json({ message: 'This message cannot be edited. The edit window may have expired.' });
    return res.json(updated);
  } catch (error) {
    console.error('Error editing support message:', error);
    return res.status(500).json({ message: 'Unable to edit this message.' });
  }
};

const deleteOwnTicketMessage = async (req, res) => {
  const { ticketId, messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({ message: 'Invalid ticket or message ID.' });
  }
  try {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId: req.user._id });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const target = await TicketMessage.findOne({
      _id: messageId, ticketId, senderId: req.user._id,
      isFromAdmin: false, isInternalNote: false, deletedAt: null,
      createdAt: { $gte: cutoff },
    }).select('+deletedMessage');
    if (!target) return res.status(403).json({ message: 'This message cannot be deleted. The deletion window may have expired.' });
    target.deletedMessage = target.message;
    target.message = 'This message was deleted.';
    target.deletedAt = new Date();
    target.deletedBy = req.user._id;
    await target.save();
    return res.json({ success: true, message: 'Message deleted.', ticketMessage: target });
  } catch (error) {
    console.error('Error deleting support message:', error);
    return res.status(500).json({ message: 'Unable to delete this message.' });
  }
};

module.exports = {
  createTicket,
  getTicketsForUser,
  getTicketByIdForUser,
  addMessageToTicket,
  editOwnTicketMessage,
  deleteOwnTicketMessage,
};
