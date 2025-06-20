const admin = require("../services/firebaseAdmin");
const User = require("../models/User");

const login = async (req, res) => {
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
    console.log(`Login successful for UID: ${user.uid}`);
  } catch (error) {
    console.error("Error during login:", error);
    // Check if the error is a Firebase Auth error for invalid token
    if (error.code && error.code.startsWith('auth/')) {
      res.status(401).json({ error: "Invalid or expired token" });
    } else {
      res.status(500).json({ error: "An unexpected error occurred during login." });
    }
  }
};

module.exports = { login };
