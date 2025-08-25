const express = require('express');
const router = express.Router();
const { getUploadUrl } = require('../controllers/uploadController');
const authMiddleware = require('../middleware/authentication');

// @route   GET /api/upload/upload-url
// @desc    Get a presigned URL for file uploads
// @access  Private
router.get('/upload-url', authMiddleware, getUploadUrl);

module.exports = router;
