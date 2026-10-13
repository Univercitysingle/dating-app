const express = require('express');
const router = express.Router();

// Import individual admin routers
const adminUsersRouter = require("./adminUsers");
const adminReportsRouter = require("./adminReports");
const adminAnalyticsRouter = require("./adminAnalytics");
const adminSupportTicketsRouter = require("./adminSupportTickets");

const adminPaymentLogsRouter = require("./adminPaymentLogs");
const adminUserActivityRouter = require("./adminUserActivity");
const adminAuditLogsRouter = require("./adminAuditLogs");

// Mount the individual admin routers
router.use("/users", adminUsersRouter);
router.use("/reports", adminReportsRouter);
router.use("/analytics", adminAnalyticsRouter);
router.use("/support-tickets", adminSupportTicketsRouter);
router.use("/transactions", require("./adminTransactions"));
router.use("/payment-logs", adminPaymentLogsRouter);
router.use("/user-activity", adminUserActivityRouter);
router.use("/audit-logs", adminAuditLogsRouter);

module.exports = router;
