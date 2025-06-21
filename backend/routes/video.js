const express = require("express");
const multer = require("multer");
const router = express.Router();
const subscriptionCheck = require("../middleware/subscriptionCheck");
const { getJitsiToken, uploadProfileVideo } = require("../controllers/videoController");

// Validation Parameters
// Using a common set of allowed video types, can be specialized if needed.
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm', 'video/x-matroska', 'video/avi'];
const MAX_PROFILE_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// File filter for main profile video
const profileVideoFileFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid video file type for profile. Allowed types: ' + ALLOWED_VIDEO_TYPES.join(', ');
    cb(null, false);
  }
};

// Configure multer for main profile video uploads
const uploadProfileVideoMulter = multer({ // Renamed to avoid conflict if 'upload' is too generic
  dest: "uploads/",
  fileFilter: profileVideoFileFilter,
  limits: { fileSize: MAX_PROFILE_VIDEO_SIZE },
});

router.get("/jitsi-token", subscriptionCheck, getJitsiToken);

router.post("/upload-profile-video", uploadProfileVideoMulter.single("video"), subscriptionCheck, uploadProfileVideo);

module.exports = router;
