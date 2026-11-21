const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const PRIORITIES = ['Urgent', 'High', 'Normal', 'Low'];
const CATEGORIES = ['Account', 'Payments', 'Profile', 'Verification', 'Safety', 'Technical', 'Other'];

const getAllTickets = async (req, res) => {
  const { page: rawPage = '1', limit: rawLimit = '10', status } = req.query;
  const validStatuses = SupportTicket.schema.path('status').enumValues;
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
    const [tickets, count] = await Promise.all([
      SupportTicket.find(query).populate('userId', 'name email').sort({ createdAt: -1 }).limit(limit).skip((page - 1) * limit).exec(),
      SupportTicket.countDocuments(query),
    ]);
    res.json({ tickets, totalPages: Math.ceil(count / limit), currentPage: page });
  } catch (error) {
    console.error('Error fetching all support tickets:', error);
    res.status(500).json({ message: 'Error fetching all support tickets.' });
  }
};

const getTicketByIdForAdmin = async (req, res) => {
  const { ticketId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(ticketId)) return res.status(400).json({ message: 'Invalid ticket ID.' });
  try {
    const ticket = await SupportTicket.findById(ticketId).populate('userId', 'name email');
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    const [messages, staff] = await Promise.all([
      TicketMessage.find({ ticketId }).sort({ createdAt: 'asc' }).populate('senderId', 'name'),
      User.find({ role: { $in: ['admin', 'superadmin'] } }).select('uid name role').sort({ name: 1 }).lean(),
    ]);
    const messageIds = messages.map(message => message._id);
    const auditQuery = [{ targetType: 'SupportTicket', targetId: ticket._id }];
    if (messageIds.length) auditQuery.push({ targetType: 'TicketMessage', targetId: { $in: messageIds } });
    const auditLogs = await AuditLog.find({ $or: auditQuery }).sort({ timestamp: -1 }).lean();

    const history = auditLogs.map(entry => {
      const changes = entry.changes || {};
      if (entry.action === 'support_ticket_message_edited') {
        return {
          _id: String(entry._id), eventType: entry.action, actorType: 'admin',
          createdAt: entry.timestamp, previousMessage: changes.previousMessage,
          updatedMessage: changes.nextMessage,
        };
      }
      if (entry.action === 'support_ticket_message_deleted') {
        return { _id: String(entry._id), eventType: entry.action, actorType: 'admin', createdAt: entry.timestamp };
      }
      return {
        _id: String(entry._id), eventType: entry.action, actorType: 'admin', createdAt: entry.timestamp,
        changes: Array.isArray(changes) ? changes : Object.entries(changes).map(([field, value]) => ({
          field, from: value?.from ?? null, to: value?.to ?? null,
        })),
      };
    });
    return res.json({ ticket, messages, staff, history });
  } catch (error) {
    console.error('Error fetching ticket details for admin:', error);
    return res.status(500).json({ message: 'Error fetching ticket details for admin.' });
  }
};

const addAdminMessageToTicket = async (req, res) => {
  const { ticketId } = req.params;
  const { message, isInternalNote = false, attachments = [] } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(ticketId)) return res.status(400).json({ message: 'Invalid ticket ID.' });
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });
  }
  if (typeof isInternalNote !== 'boolean') return res.status(400).json({ message: 'Invalid internal note flag.' });
  if (!Array.isArray(attachments) || attachments.length > 5 || attachments.some(file =>
    !file || typeof file.key !== 'string' || typeof file.name !== 'string' ||
    typeof file.url !== 'string' || typeof file.type !== 'string'
  )) return res.status(400).json({ message: 'Invalid message attachments.' });

  try {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const newMessage = await TicketMessage.create({
      ticketId, senderId: req.user._id, message: message.trim(), isFromAdmin: true,
      isInternalNote, attachments,
    });
    if (!isInternalNote) {
      ticket.status = 'Waiting for Customer';
      await ticket.save();
    }
    return res.status(201).json(newMessage);
  } catch (error) {
    console.error('Error adding admin message to ticket:', error);
    return res.status(500).json({ message: 'Unable to add the ticket message.' });
  }
};

const updateTicketStatus = async (req, res) => {
  const { ticketId } = req.params;
  const body = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(ticketId)) return res.status(400).json({ message: 'Invalid ticket ID.' });
  const allowedFields = ['status', 'priority', 'category', 'assignedToUid', 'resolutionSummary'];
  const suppliedFields = Object.keys(body);
  if (!suppliedFields.length || suppliedFields.some(field => !allowedFields.includes(field))) {
    return res.status(400).json({ message: 'Invalid ticket update fields.' });
  }
  if (body.status !== undefined && (typeof body.status !== 'string' || !SupportTicket.schema.path('status').enumValues.includes(body.status))) {
    return res.status(400).json({ message: 'Invalid ticket status.' });
  }
  if (body.priority !== undefined && (typeof body.priority !== 'string' || !PRIORITIES.includes(body.priority))) {
    return res.status(400).json({ message: 'Invalid ticket priority.' });
  }
  if (body.category !== undefined && (typeof body.category !== 'string' || !CATEGORIES.includes(body.category))) {
    return res.status(400).json({ message: 'Invalid ticket category.' });
  }
  if (body.assignedToUid !== undefined && body.assignedToUid !== null &&
      (typeof body.assignedToUid !== 'string' || body.assignedToUid.length > 128)) {
    return res.status(400).json({ message: 'Invalid ticket assignee.' });
  }
  if (body.resolutionSummary !== undefined &&
      (typeof body.resolutionSummary !== 'string' || body.resolutionSummary.trim().length > 2000)) {
    return res.status(400).json({ message: 'Resolution summary must be 2,000 characters or fewer.' });
  }

  try {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });

    const changes = {};
    for (const field of ['status', 'priority', 'category', 'assignedToUid', 'resolutionSummary']) {
      if (body[field] === undefined) continue;
      const next = field === 'assignedToUid' ? (body[field] || '') :
        field === 'resolutionSummary' ? body[field].trim() : body[field];
      const previous = ticket[field] ?? (field === 'priority' ? 'Normal' : field === 'category' ? 'Other' : field === 'assignedToUid' || field === 'resolutionSummary' ? '' : null);
      if (String(previous ?? '') !== String(next ?? '')) changes[field] = { from: previous, to: next };
      ticket[field] = next;
    }

    if (ticket.status === 'Closed') {
      if (!ticket.resolutionSummary.trim()) return res.status(400).json({ message: 'Add a resolution summary before closing this ticket.' });
      if (!ticket.resolvedAt) ticket.resolvedAt = new Date();
    } else {
      ticket.resolvedAt = null;
    }

    if (body.assignedToUid !== undefined && ticket.assignedToUid) {
      const assignee = await User.findOne({
        uid: ticket.assignedToUid,
        role: { $in: ['admin', 'superadmin'] },
      }).select('_id');
      if (!assignee) return res.status(400).json({ message: 'The selected assignee is not an active administrator.' });
    }

    if (Object.keys(changes).length) {
      await ticket.save();
      await AuditLog.create({
        adminId: req.user._id, action: 'support_ticket_updated',
        targetType: 'SupportTicket', targetId: ticket._id, changes,
      });
    }
    return res.json(ticket);
  } catch (error) {
    console.error('Error updating support ticket:', error);
    return res.status(500).json({ message: 'Unable to update the support ticket.' });
  }
};

const editTicketMessageAsAdmin = async (req, res) => {
  const { ticketId, messageId } = req.params;
  const { message } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({ message: 'Invalid ticket or message ID.' });
  }
  if (typeof message !== 'string' || !message.trim() || message.trim().length > 5000) {
    return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });
  }
  try {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const target = await TicketMessage.findOne({ _id: messageId, ticketId, deletedAt: null });
    if (!target) return res.status(404).json({ message: 'Message not found.' });
    const nextMessage = message.trim();
    await AuditLog.create({
      adminId: req.user._id, action: 'support_ticket_message_edited',
      targetType: 'TicketMessage', targetId: target._id,
      changes: { ticketId: ticket._id, previousMessage: target.message, nextMessage, isInternalNote: Boolean(target.isInternalNote) },
    });
    target.message = nextMessage;
    target.editedAt = new Date();
    await target.save();
    return res.json(target);
  } catch (error) {
    console.error('Admin support message edit failed:', error);
    return res.status(500).json({ message: 'Unable to edit this message.' });
  }
};

const deleteTicketMessageAsAdmin = async (req, res) => {
  const { ticketId, messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(ticketId) || !mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({ message: 'Invalid ticket or message ID.' });
  }
  try {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const target = await TicketMessage.findOne({ _id: messageId, ticketId, deletedAt: null });
    if (!target) return res.status(404).json({ message: 'Message not found.' });
    await AuditLog.create({
      adminId: req.user._id, action: 'support_ticket_message_deleted',
      targetType: 'TicketMessage', targetId: target._id,
      changes: { ticketId: ticket._id, previousMessage: target.message, isInternalNote: Boolean(target.isInternalNote) },
    });
    target.deletedMessage = target.message;
    target.deletedAt = new Date();
    target.deletedBy = req.user._id;
    target.message = 'This message was deleted.';
    await target.save();
    return res.json({ success: true, message: 'Message deleted.' });
  } catch (error) {
    console.error('Admin support message deletion failed:', error);
    return res.status(500).json({ message: 'Unable to delete this message.' });
  }
};

module.exports = {
  getAllTickets,
  getTicketByIdForAdmin,
  addAdminMessageToTicket,
  updateTicketStatus,
  editTicketMessageAsAdmin,
  deleteTicketMessageAsAdmin,
};
