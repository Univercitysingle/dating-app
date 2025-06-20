const admin = require("../services/firebaseAdmin");
const User = require("../models/User");
const bcrypt = require('bcryptjs');

const login = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });

    const decodedToken = await admin.auth().verifyIdToken(token); // Renamed to avoid conflict
    let user = await User.findOne({ uid: decodedToken.uid });

    if (!user) {
      // If user is created via social login or first Firebase login,
      // and needs a password set (e.g. manually created sadmin account)
      // this mustSetPassword flag would be set by an admin tool or script.
      user = new User({
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || "",
        // role: 'sadmin', // Example: This might be set by an admin creation script
        // mustSetPassword: true // Example: This might be set by an admin creation script
      });
      await user.save();
    }

    const responsePayload = {
      token, // This is the Firebase token from the client
      user: {
        uid: user.uid,
        email: user.email,
        name: user.name,
        plan: user.plan,
        videoProfile: user.videoProfile,
        role: user.role, // Return role
      },
    };

    if (user.mustSetPassword === true) {
      responsePayload.requiresPasswordSetup = true;
    }

    res.json(responsePayload);
    console.log(`Login successful for UID: ${user.uid}. Role: ${user.role}. Must set password: ${user.mustSetPassword}`);
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

const setInitialPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) { // Basic validation
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    // req.user is populated by authMiddleware from the Firebase token
    if (!req.user || !req.user.uid) {
        return res.status(401).json({ error: "User not authenticated properly." });
    }

    const user = await User.findOne({ uid: req.user.uid });

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    if (user.mustSetPassword !== true) {
      return res.status(400).json({ error: "Password already set or action not allowed." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.mustSetPassword = false;
    // Potentially, set isProfileVisible to true here if it was false during setup
    // user.isProfileVisible = true;

    await user.save();

    // Decide on response: just success, or include user info/new token?
    // For now, simple success. If a new local JWT session system were being introduced,
    // this might be a place to issue that token.
    res.json({ message: "Password set successfully." });
    console.log(`Initial password set for UID: ${user.uid}`);

  } catch (error) {
    console.error("Error setting initial password:", error);
    res.status(500).json({ error: "An unexpected error occurred while setting password." });
  }
};

module.exports = { login, setInitialPassword };
