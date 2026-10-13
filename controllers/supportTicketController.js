const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');
const { v4: uuidv4 } = require('uuid');

const createTicket = async (req, res) => {
  const { subject, message } = req.body;
  const userId = req.user._id;

  try {
    const ticketNumber = uuidv4();

    const newTicket = new SupportTicket({
      userId,
      subject,
      ticketNumber,
    });

    await newTicket.save();

    const newMessage = new TicketMessage({
      ticketId: newTicket._id,
      senderId: userId,
      message,
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

  try {
    const ticket = await SupportTicket.findOne({ _id: ticketId, userId });

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const messages = await TicketMessage.find({ ticketId }).sort({ createdAt: 'asc' }).populate('senderId', 'name');

    res.json({ ticket, messages });
  } catch (error) {
    console.error('Error fetching ticket details:', error);
    res.status(500).json({ message: 'Error fetching ticket details', error: error.message });
  }
};

const addMessageToTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { message } = req.body;
  const userId = req.user._id;

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
      message,
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

module.exports = {
  createTicket,
  getTicketsForUser,
  getTicketByIdForUser,
  addMessageToTicket,
};
