const express = require('express');
const router = express.Router();
const { submitReport } = require('../controllers/reportsController');

// Submit a new report
router.post('/', submitReport);

module.exports = router;
