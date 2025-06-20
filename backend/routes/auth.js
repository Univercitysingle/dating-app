const express = require("express");
const router = express.Router();
const { login } = require("../controllers/authController");

// Login endpoint to verify Firebase token and create user if not exists
router.post("/login", login);

module.exports = router;
