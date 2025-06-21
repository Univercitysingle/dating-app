const express = require("express");
const router = express.Router();
const {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadAudioBio, // To be created
  uploadVideoBioSnippet, // To be created
} = require("../controllers/usersController");
const authMiddleware = require("../middleware/authMiddleware");
const multer = require("multer");

// Validation Parameters
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/m4a'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/x-flv', 'video/webm']; // Re-using for video bio
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_BIO_SIZE = 10 * 1024 * 1024; // 10MB

// File filter for audio
const audioFileFilter = (req, file, cb) => {
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid audio file type. Allowed types: ' + ALLOWED_AUDIO_TYPES.join(', ');
    cb(null, false);
  }
};

// File filter for video
const videoBioFileFilter = (req, file, cb) => {
  if (ALLOWED_VIDEO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid video file type. Allowed types: ' + ALLOWED_VIDEO_TYPES.join(', ');
    cb(null, false);
  }
};

// Configure multer for audio bio uploads
const uploadAudio = multer({
  dest: "uploads/",
  fileFilter: audioFileFilter,
  limits: { fileSize: MAX_AUDIO_SIZE },
});

// Configure multer for video bio snippet uploads
const uploadVideoBio = multer({
  dest: "uploads/",
  fileFilter: videoBioFileFilter,
  limits: { fileSize: MAX_VIDEO_BIO_SIZE },
});


// Get current user profile
router.get("/me", authMiddleware, getCurrentUserProfile);

// Update profile
router.put("/me", authMiddleware, updateCurrentUserProfile);

// Upload Audio Bio
router.post(
  "/upload-audio-bio",
  authMiddleware,
  uploadAudio.single("audio-bio"), // Use specific multer instance
  uploadAudioBio
);

// Upload Video Bio Snippet
router.post(
  "/upload-video-bio-snippet",
  authMiddleware,
  uploadVideoBio.single("video-bio-snippet"), // Use specific multer instance
  uploadVideoBioSnippet
);

// Unblock a user
router.post("/unblock/:userIdToUnblock", authMiddleware, unblockUser);

// Block a user
router.post("/block/:userIdToBlock", authMiddleware, blockUser); // Added authMiddleware

module.exports = router;
