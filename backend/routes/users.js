const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Get current user profile
router.get("/me", async (req, res) => {
  const user = await User.findOne({ uid: req.user.uid });
  res.json(user);
});

// Update profile
router.put("/me", async (req, res) => {
  const update = req.body;
  const allowedFields = ["name", "age", "gender", "preference", "bio", "photos"];
  const sanitizedUpdate = {};

  for (const key of allowedFields) {
    if (update[key] !== undefined) sanitizedUpdate[key] = update[key];
  }

  try {
    const user = await User.findOneAndUpdate({ uid: req.user.uid }, sanitizedUpdate, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
