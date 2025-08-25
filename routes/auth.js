const express = require("express");
const router = express.Router();

// Import controller functions
const { login, setInitialPassword } = require("../controllers/authController");

// Import middleware to protect routes
const authMiddleware = require("../middleware/authentication");

// @route   POST /api/auth/login
// @desc    Verify Firebase token and create user if not exists
// @access  Public
router.post("/login", login);

// @route   GET /api/auth/test
// @desc    Test route
// @access  Public
router.get("/test", (req, res) => {
  res.send("Auth test route is working");
});

// Note: Logout is handled on the client-side by clearing the stored token.
// There is no server-side endpoint for logout in a stateless token-based authentication system.

// @route   POST /api/auth/set-initial-password
// @desc    Set initial password for users flagged with mustSetPassword = true
// @access  Private (requires Firebase token)
router.post("/set-initial-password", authMiddleware, setInitialPassword);

module.exports = router;
