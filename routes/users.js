const express = require("express");
const router = express.Router();
const {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
  uploadPhoto,
  updatePhotoOrder,
  deletePhoto,
  discoverUsers,
  getUserProfile,
  getLikes,
  uploadBankSlip,
  getSubscriptionHistory,
} = require("../controllers/usersController");
const authMiddleware = require("../middleware/authentication");
const premiumAuthMiddleware = require('../middleware/premiumAuthMiddleware');
const multer = require("multer");

// Validation Parameters
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
const MAX_AUDIO_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// File filter for images
const imageFileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid image file type. Allowed types: ' + ALLOWED_IMAGE_TYPES.join(', ');
    cb(null, false);
  }
};

// Configure multer for photo uploads
const storage = multer.memoryStorage();
const uploadImage = multer({
  storage: storage,
  fileFilter: imageFileFilter,
  limits: { fileSize: MAX_IMAGE_SIZE },
});

// Get current user profile
router.get("/me", authMiddleware, getCurrentUserProfile);

// Get current user's subscription history
router.get("/me/subscriptions", authMiddleware, getSubscriptionHistory);

// Get users for discovery swipe deck
router.get("/discover", authMiddleware, discoverUsers);

// Get users who liked the current user
router.get("/likes", authMiddleware, getLikes);

// Get a specific user's profile
router.get("/:userId", authMiddleware, getUserProfile);

// Update profile
router.put("/me", authMiddleware, updateCurrentUserProfile);

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

// Upload Bank Slip
router.post(
  "/subscription/upload-slip",
  authMiddleware,
  uploadImage.single("bankSlip"),
  uploadBankSlip
);

module.exports = router;
