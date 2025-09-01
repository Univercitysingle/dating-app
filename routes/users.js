const express = require("express");
const router = express.Router();
const {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadAudioBio,
  uploadPhoto,
  updatePhotoOrder,
  deletePhoto,
  discoverUsers,
  getUserProfile,
} = require("../controllers/usersController");
const authMiddleware = require("../middleware/authentication");
const multer = require("multer");

// Validation Parameters
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// File filter for audio
const audioFileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('audio/')) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid file type. Only audio files are allowed.';
    cb(null, false);
  }
};

// File filter for images
const imageFileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid image file type. Allowed types: ' + ALLOWED_IMAGE_TYPES.join(', ');
    cb(null, false);
  }
};

// Configure multer for audio bio uploads
const uploadAudio = multer({
  dest: "uploads/",
  fileFilter: audioFileFilter,
  limits: { fileSize: MAX_AUDIO_SIZE },
});

// Configure multer for photo uploads
const uploadImage = multer({
  dest: "uploads/",
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

// Get current user profile
router.get("/me", authMiddleware, getCurrentUserProfile);

// Get users for discovery swipe deck
router.get("/discover", authMiddleware, discoverUsers);

// Get a specific user's profile
router.get("/:userId", authMiddleware, getUserProfile);

// Update profile
router.put("/me", authMiddleware, updateCurrentUserProfile);

// Upload Audio Bio
router.post(
  "/upload-audio-bio",
  authMiddleware,
  uploadAudio.single("audio-bio"),
  uploadAudioBio
);

// Upload Photo
router.post(
  "/photos",
  authMiddleware,
  uploadImage.single("photo"),
  uploadPhoto
);

// Update Photo Order
router.put("/photos/order", authMiddleware, updatePhotoOrder);

// Delete Photo
router.delete("/photos", authMiddleware, deletePhoto);

// Unblock a user
router.post("/unblock/:userIdToUnblock", authMiddleware, unblockUser);

// Block a user
router.post("/block/:userIdToBlock", authMiddleware, blockUser);

module.exports = router;
