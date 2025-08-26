const express = require('express');
const router = express.Router();
const { like, pass } = require('../controllers/swipeController');
const authMiddleware = require('../middleware/authentication');

router.post('/like', authMiddleware, like);
router.post('/pass', authMiddleware, pass);

module.exports = router;
