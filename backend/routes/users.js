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
const authMiddleware = require("../middleware/authMiddleware"); // Assuming this is the correct path
const multer = require("multer");

// Configure multer for file uploads
const upload = multer({ dest: "uploads/" });

// Get current user profile
router.get("/me", authMiddleware, getCurrentUserProfile); // Added authMiddleware for consistency

// Update profile
router.put("/me", authMiddleware, updateCurrentUserProfile); // Added authMiddleware for consistency

// Upload Audio Bio
router.post(
  "/upload-audio-bio",
  authMiddleware,
  upload.single("audio-bio"),
  uploadAudioBio
);

// Upload Video Bio Snippet
router.post(
  "/upload-video-bio-snippet",
  authMiddleware,
  upload.single("video-bio-snippet"),
  uploadVideoBioSnippet
);

// Unblock a user
router.post("/unblock/:userIdToUnblock", authMiddleware, unblockUser); // Added authMiddleware

// Block a user
router.post("/block/:userIdToBlock", authMiddleware, blockUser); // Added authMiddleware

module.exports = router;
