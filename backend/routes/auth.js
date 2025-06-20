const express = require("express");
const router = express.Router();
const { login, setInitialPassword } = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware"); // Assuming this is the correct path

// Login endpoint to verify Firebase token and create user if not exists
router.post("/login", login);

// Set initial password after first login for users with mustSetPassword = true
router.post("/set-initial-password", authMiddleware, setInitialPassword);

module.exports = router;
