const express = require('express');
const router = express.Router();
const { like, pass, superLike, undoSwipe } = require('../controllers/swipeController');
const authMiddleware = require('../middleware/authentication');
const premiumAuthMiddleware = require('../middleware/premiumAuthMiddleware');

router.post('/like', authMiddleware, like);
router.post('/pass', authMiddleware, pass);
router.post('/superlike', authMiddleware, superLike);
router.post('/undo', authMiddleware, undoSwipe);

module.exports = router;
