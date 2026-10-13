const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');

const getAllTickets = async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;

  try {
    const query = {};
    if (status) {
      query.status = status;
    }

    const tickets = await SupportTicket.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: 'desc' })
      .limit(limit * 1)
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
  const { message } = req.body;
  const adminUserId = req.user._id;

  try {
    const ticket = await SupportTicket.findById(ticketId);

    if (!ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    const newMessage = new TicketMessage({
      ticketId,
      senderId: adminUserId,
      message,
      isFromAdmin: true,
    });

    await newMessage.save();

    // Update ticket status
    ticket.status = 'Waiting for Customer';
    await ticket.save();

    res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error adding admin message to ticket:', error);
    res.status(500).json({ message: 'Error adding admin message to ticket', error: error.message });
  }
};

const updateTicketStatus = async (req, res) => {
  const { ticketId } = req.params;
  const { status } = req.body;

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
