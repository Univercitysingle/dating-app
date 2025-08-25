const express = require('express');
const router = express.Router();

const adminReportsController = require('../controllers/adminReportsController');
const authMiddleware = require('../middleware/authentication');
const { requireRole } = require('../middleware/adminAuthMiddleware');

// Prefix for these routes will be /api/admin/reports

// GET / - List all reports with filtering and pagination
router.get(
  '/',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminReportsController.listReports
);

// GET /:reportId - Get a single report by its ID
router.get(
  '/:reportId',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminReportsController.getReportById
);

// POST /:reportId/action - Perform a moderation action on a report
router.post(
  '/:reportId/action',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminReportsController.performModerationAction
);

module.exports = router;
