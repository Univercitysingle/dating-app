const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/adminController');
const { requireRole } = require('../middleware/adminAuthMiddleware');
const authMiddleware = require('../middleware/authentication');

// Protect all routes in this file
router.use(authMiddleware);
router.use(requireRole(['admin', 'superadmin']));

router.get('/', getAuditLogs);

module.exports = router;
