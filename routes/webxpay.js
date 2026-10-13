const express = require('express');
const router = express.Router();
const { handleResponse } = require('../controllers/webxpayController');

router.post('/response', handleResponse);

module.exports = router;
