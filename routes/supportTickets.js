const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTicketsForUser,
  getTicketByIdForUser,
  addMessageToTicket,
} = require('../controllers/supportTicketController');
const authMiddleware = require('../middleware/authentication');
const { editUserMessage, deleteUserMessage } = require('../controllers/ticketMessageController');

router.use(authMiddleware);

router.post('/', createTicket);
router.get('/', getTicketsForUser);
router.get('/:ticketId', getTicketByIdForUser);
router.post('/:ticketId/messages', addMessageToTicket);
router.patch('/:ticketId/messages/:messageId', editUserMessage);
router.delete('/:ticketId/messages/:messageId', deleteUserMessage);

module.exports = router;
