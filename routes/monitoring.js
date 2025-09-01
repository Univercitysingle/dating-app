const express = require('express');
const router = express.Router();
const { getMonitoringData } = require('../controllers/monitoringController');
const adminAuthMiddleware = require('../middleware/adminAuthMiddleware');

router.get('/', adminAuthMiddleware, getMonitoringData);

module.exports = router;
