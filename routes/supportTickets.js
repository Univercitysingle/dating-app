const express = require('express');
const router = express.Router();
const {
  createTicket,
  getTicketsForUser,
  getTicketByIdForUser,
  addMessageToTicket,
} = require('../controllers/supportTicketController');
const authMiddleware = require('../middleware/authentication');

router.use(authMiddleware);

router.post('/', createTicket);
router.get('/', getTicketsForUser);
router.get('/:ticketId', getTicketByIdForUser);
router.post('/:ticketId/messages', addMessageToTicket);

module.exports = router;
