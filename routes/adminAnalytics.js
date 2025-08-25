const express = require('express');
const router = express.Router();

const adminAnalyticsController = require('../controllers/adminAnalyticsController');
const authMiddleware = require('../middleware/authentication');
const { requireRole } = require('../middleware/adminAuthMiddleware');

// Prefix for these routes will be /api/admin/analytics

// GET /summary - Get a summary of analytics data
router.get(
  '/summary',
  authMiddleware,
  requireRole(['admin', 'superadmin']),
  adminAnalyticsController.getAnalyticsSummary
);

module.exports = router;
