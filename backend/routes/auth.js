const express = require("express");
const router = express.Router();
const admin = require("../services/firebaseAdmin");
const User = require("../models/User");

// Login endpoint to verify Firebase token and create user if not exists
router.post("/login", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });

    const decoded = await admin.auth().verifyIdToken(token);
    let user = await User.findOne({ uid: decoded.uid });

    if (!user) {
      user = new User({ uid: decoded.uid, email: decoded.email, name: decoded.name || "" });
      await user.save();
    }

    res.json({
      token,
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        plan: user.plan,
        videoProfile: user.videoProfile,
      },
    });
  } catch (error) {
    res.status(401).json({ error: "Invalid token" });
  }
});

module.exports = router;
