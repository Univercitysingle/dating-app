const express = require("express");
const router = express.Router();
const User = require("../models/User");

// Return a list of potential matches based on simple preference filtering
router.get("/", async (req, res) => {
  const currentUser = await User.findOne({ uid: req.user.uid });
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  // Simple filter: opposite gender preference and not blocked
  const matches = await User.find({
    uid: { $ne: currentUser.uid },
    gender: currentUser.preference,
    blocked: { $ne: currentUser.uid },
  }).limit(20);

  res.json(matches);
});

module.exports = router;
