const admin = require("../services/firebaseAdmin");
const { findOrCreateUserFromToken } = require('../utils/userUtils');
const Subscription = require('../models/Subscription');
const bcrypt = require('bcryptjs');

const login = async (req, res) => {
  const log = req.log;
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token required" });

    log.info(`Login attempt for token: ${token.substring(0, 10)}...`);

    const decodedToken = await admin.auth().verifyIdToken(token);
    const user = await findOrCreateUserFromToken(decodedToken);

    if (!user) {
      log.warn(`User provisioning failed for token: ${token.substring(0, 10)}...`);
      return res.status(403).json({ error: "User provisioning failed. Email may not be verified or token details are insufficient." });
    }

    const userObject = user.toObject();

    const activeSubscription = await Subscription.findOne({
      userId: userObject._id,
      status: 'active',
    });

    userObject.isPremium = !!activeSubscription;

    const responsePayload = {
      token,
      user: userObject,
    };

    if (user.mustSetPassword === true) {
      responsePayload.requiresPasswordSetup = true;
    }

    res.json(responsePayload);
    log.info(`Login successful for UID: ${user.uid}. Role: ${user.role}. Must set password: ${user.mustSetPassword}`);
  } catch (error) {
    log.error({ err: error }, "Error during login");
    if (error.code && error.code.startsWith('auth/')) {
      res.status(401).json({ error: "Invalid or expired token" });
    } else {
      res.status(500).json({ error: "An unexpected error occurred during login." });
    }
  }
};

const setInitialPassword = async (req, res) => {
  const log = req.log;
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      log.warn(`Failed to set initial password for UID: ${req.user.uid}. Password too short.`);
      return res.status(400).json({ error: "Password must be at least 6 characters long." });
    }

    if (!req.user || !req.user.uid) {
        log.warn("Attempt to set initial password without authentication.");
        return res.status(401).json({ error: "User not authenticated properly." });
    }

    const User = require('../models/User');
    const user = await User.findOne({ uid: req.user.uid });

    if (!user) {
      log.warn(`Attempt to set initial password for non-existent user with UID: ${req.user.uid}.`);
      return res.status(404).json({ error: "User not found." });
    }

    if (user.mustSetPassword !== true) {
      log.warn(`Attempt to set initial password for user with UID: ${req.user.uid} where mustSetPassword is not true.`);
      return res.status(400).json({ error: "Password already set or action not allowed." });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.mustSetPassword = false;

    await user.save();

    res.json({ message: "Password set successfully." });
    log.info(`Initial password set for UID: ${user.uid}`);

  } catch (error) {
    log.error({ err: error }, "Error setting initial password");
    res.status(500).json({ error: "An unexpected error occurred while setting password." });
  }
};

module.exports = { login, setInitialPassword };
