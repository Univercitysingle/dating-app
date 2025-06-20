const express = require("express");
const router = express.Router();
const {
  getCurrentUserProfile,
  updateCurrentUserProfile,
  unblockUser,
  blockUser,
} = require("../controllers/usersController");

// Get current user profile
router.get("/me", getCurrentUserProfile);

// Update profile
router.put("/me", updateCurrentUserProfile);

// Unblock a user
router.post("/unblock/:userIdToUnblock", unblockUser);

// Block a user
router.post("/block/:userIdToBlock", blockUser);

module.exports = router;
