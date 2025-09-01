const express = require("express");
const router = express.Router();
const monitoringController = require("../controllers/monitoringController");
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");

// Small async wrapper to handle errors gracefully
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Protect route with adminAuthMiddleware
router.get(
  "/",
  adminAuthMiddleware,
  asyncHandler(monitoringController.getMonitoringData)
);

module.exports = router;
