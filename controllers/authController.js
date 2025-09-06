const admin = require("../services/firebaseAdmin");
const { findOrCreateUserFromToken } = require('../utils/userUtils');
const { getGeolocation } = require('../services/ipinfoService');
const Subscription = require('../models/Subscription');
const bcrypt = require('bcryptjs');

const login = async (req, res) => {
  const log = req.log;
  try {
    const { token, email, password } = req.body;

    // Hardcoded superadmin login
    if (email && password) {
      if (
        email === process.env.SUPER_ADMIN_EMAIL &&
        password === process.env.SUPER_ADMIN_PASSWORD
      ) {
        const superadminUID = "superadmin_uid"; // A consistent, unique ID for the superadmin
        const customToken = await admin.auth().createCustomToken(superadminUID, { role: 'superadmin' });
        log.info({
          message: "Superadmin login successful",
          userId: superadminUID,
          ip: req.ip,
          device: req.headers['user-agent']
        });

        const superadminUserObject = {
          uid: superadminUID,
          email: process.env.SUPER_ADMIN_EMAIL,
          name: "Super Admin",
          role: "superadmin",
          isPremium: true, // Superadmins should have all privileges
        };

        return res.json({
          token: customToken,
          user: superadminUserObject,
        });
      } else {
        log.warn({
          message: "Superadmin login failed",
          email: email,
          ip: req.ip
        });
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    // Firebase token login for regular users
    if (token) {
      log.info(`Login attempt for token: ${token.substring(0, 10)}...`);

      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await findOrCreateUserFromToken(decodedToken);

      if (user) {
        user.lastLoginDevice = req.headers['user-agent'];
        user.lastLoginIp = req.ip;

        const geo = await getGeolocation(req.ip);
        if (geo) {
            user.location = {
                type: 'Point',
                coordinates: [parseFloat(geo.loc.split(',')[1]), parseFloat(geo.loc.split(',')[0])],
                city: geo.city,
                region: geo.region,
                country: geo.country,
                locationLastUpdatedAt: new Date()
            };
        }

        await user.save();
        log.info({
          message: "User login successful",
          userId: user.uid,
          ip: req.ip,
          device: req.headers['user-agent']
        });
      }

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
      return;
    }

    // If neither login method is attempted
    return res.status(400).json({ error: "Request must contain either a Firebase token or email/password." });

  } catch (error) {
    log.error({ err: error }, "Error during login");
    if (error.code && error.code.startsWith('auth/')) {
      log.warn({
        message: "User login failed",
        error: error.message,
        ip: req.ip
      });
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

const logout = (req, res) => {
  const user = req.user;
  if (user) {
    req.log.info({
      message: "User logged out",
      userId: user.uid,
      ip: req.ip
    });
  } else {
    req.log.info({
      message: "Logout endpoint hit by unauthenticated user",
      ip: req.ip
    });
  }
  // In a stateless token-based auth system, the server doesn't need to do much.
  // The client is responsible for destroying the token.
  // This endpoint is here to provide a clean logout mechanism for the client.
  res.status(200).json({ message: "Logged out successfully." });
};

module.exports = { login, logout, setInitialPassword };
