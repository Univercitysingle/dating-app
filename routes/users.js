const express = require("express");
const router = express.Router();
const {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadAudioBio, // To be created
  discoverUsers,
} = require("../controllers/usersController");
const authMiddleware = require("../middleware/authentication");
const multer = require("multer");

// Validation Parameters
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/aac', 'audio/m4a'];
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB

// File filter for audio
const audioFileFilter = (req, file, cb) => {
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid audio file type. Allowed types: ' + ALLOWED_AUDIO_TYPES.join(', ');
    cb(null, false);
  }
};

// Configure multer for audio bio uploads
const uploadAudio = multer({
  dest: "uploads/",
  fileFilter: audioFileFilter,
  limits: { fileSize: MAX_AUDIO_SIZE },
});

// Get current user profile
router.get("/me", authMiddleware, getCurrentUserProfile);

// Get users for discovery swipe deck
router.get("/discover", authMiddleware, discoverUsers);

// Update profile
router.put("/me", authMiddleware, updateCurrentUserProfile);

// Upload Audio Bio
router.post(
  "/upload-audio-bio",
  authMiddleware,
  uploadAudio.single("audio-bio"), // Use specific multer instance
  uploadAudioBio
);

// Unblock a user
router.post("/unblock/:userIdToUnblock", authMiddleware, unblockUser);

// Block a user
router.post("/block/:userIdToBlock", authMiddleware, blockUser); // Added authMiddleware

module.exports = router;
