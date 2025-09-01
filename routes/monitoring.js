const express = require("express");
const router = express.Router();
const monitoringController = require("../controllers/monitoringController");
const adminAuthMiddleware = require("../middleware/adminAuthMiddleware");

// Protect route with adminAuthMiddleware
router.get("/", adminAuthMiddleware, monitoringController.getMonitoringData);

module.exports = router;
