const express = require("express");
const router = express.Router();

// Import controller functions
const { login, setInitialPassword } = require("../controllers/authController");

// Import middleware to protect routes
const authMiddleware = require("../middleware/authMiddleware");

// @route   POST /api/auth/login
// @desc    Verify Firebase token and create user if not exists
// @access  Public
router.post("/login", login);

// @route   POST /api/auth/set-initial-password
// @desc    Set initial password for users flagged with mustSetPassword = true
// @access  Private (requires Firebase token)
router.post("/set-initial-password", authMiddleware, setInitialPassword);

module.exports = router;
