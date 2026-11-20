const mongoose = require('mongoose');
const SupportTicket = require('../models/SupportTicket');
const TicketMessage = require('../models/TicketMessage');

const validId = (value) => mongoose.Types.ObjectId.isValid(value);
const validateMessage = (value) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 5000;

const updateMessage = async (req, res, isAdmin) => {
  const { ticketId, messageId } = req.params;
  const userId = req.user?._id;
  const { message } = req.body || {};
  if (!validId(ticketId) || !validId(messageId)) return res.status(400).json({ message: 'Invalid ticket or message ID.' });
  if (!validateMessage(message)) return res.status(400).json({ message: 'Message must be between 1 and 5000 characters.' });

  try {
    const ticket = isAdmin ? await SupportTicket.findById(ticketId) : await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const query = { _id: messageId, ticketId, deletedAt: null };
    if (!isAdmin) query.senderId = userId;
    const target = await TicketMessage.findOne(query);
    if (!target || (!isAdmin && target.isInternalNote)) return res.status(404).json({ message: 'Message not found.' });
    if (!isAdmin && Date.now() - new Date(target.createdAt).getTime() > 15 * 60 * 1000) {
      return res.status(403).json({ message: 'Messages can only be edited within 15 minutes of sending.' });
    }
    target.message = message.trim();
    target.editedAt = new Date();
    await target.save();
    return res.json({ message: 'Message updated.', item: target });
  } catch (error) {
    req.log?.error?.({ err: error }, 'Support message edit failed');
    return res.status(500).json({ message: 'Unable to edit this message.' });
  }
};

const deleteMessage = async (req, res, isAdmin) => {
  const { ticketId, messageId } = req.params;
  const userId = req.user?._id;
  if (!validId(ticketId) || !validId(messageId)) return res.status(400).json({ message: 'Invalid ticket or message ID.' });
  try {
    const ticket = isAdmin ? await SupportTicket.findById(ticketId) : await SupportTicket.findOne({ _id: ticketId, userId });
    if (!ticket) return res.status(404).json({ message: 'Ticket not found.' });
    const query = { _id: messageId, ticketId, deletedAt: null };
    if (!isAdmin) query.senderId = userId;
    const target = await TicketMessage.findOne(query).select('+originalMessage');
    if (!target || (!isAdmin && target.isInternalNote)) return res.status(404).json({ message: 'Message not found.' });
    if (!isAdmin && Date.now() - new Date(target.createdAt).getTime() > 60 * 60 * 1000) {
      return res.status(403).json({ message: 'Messages can only be deleted within 60 minutes of sending.' });
    }
    target.originalMessage = target.message;
    target.message = '';
    target.deletedAt = new Date();
    target.deletedBy = userId;
    await target.save();
    return res.json({ message: 'Message deleted.' });
  } catch (error) {
    req.log?.error?.({ err: error }, 'Support message delete failed');
    return res.status(500).json({ message: 'Unable to delete this message.' });
  }
};

exports.editUserMessage = (req, res) => updateMessage(req, res, false);
exports.deleteUserMessage = (req, res) => deleteMessage(req, res, false);
exports.editAdminMessage = (req, res) => updateMessage(req, res, true);
exports.deleteAdminMessage = (req, res) => deleteMessage(req, res, true);
