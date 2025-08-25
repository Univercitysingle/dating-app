const express = require('express');
const router = express.Router();
const { recordSwipe } = require('../controllers/swipesController');
const authMiddleware = require('../middleware/authentication');

// POST /api/swipes - Record a swipe action
router.post('/', authMiddleware, recordSwipe);

module.exports = router;
