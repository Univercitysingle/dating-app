const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTicketsForUser,
  getTicketByIdForUser,
  addMessageToTicket,
  editOwnTicketMessage,
  deleteOwnTicketMessage,
} = require('../controllers/supportTicketController');
const authMiddleware = require('../middleware/authentication');

router.use(authMiddleware);

router.post('/', createTicket);
router.get('/', getTicketsForUser);
router.get('/:ticketId', getTicketByIdForUser);
router.post('/:ticketId/messages', addMessageToTicket);
router.patch('/:ticketId/messages/:messageId', editOwnTicketMessage);
router.delete('/:ticketId/messages/:messageId', deleteOwnTicketMessage);

module.exports = router;
