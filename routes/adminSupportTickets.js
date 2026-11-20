const express = require('express');
const router = express.Router();
const {
  getAllTickets,
  getTicketByIdForAdmin,
  addAdminMessageToTicket,
  updateTicketStatus,
} = require('../controllers/adminSupportTicketController');
const { requireRole } = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authentication');
const { editAdminMessage, deleteAdminMessage } = require('../controllers/ticketMessageController');

// Protect all routes in this file
router.use(authMiddleware);
router.use(requireRole(['admin', 'superadmin']));

router.get('/', getAllTickets);
router.get('/:ticketId', getTicketByIdForAdmin);
router.post('/:ticketId/messages', addAdminMessageToTicket);
router.patch('/:ticketId/messages/:messageId', editAdminMessage);
router.delete('/:ticketId/messages/:messageId', deleteAdminMessage);
router.put('/:ticketId/status', updateTicketStatus);

module.exports = router;
