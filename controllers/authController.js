const admin = require("../services/firebaseAdmin");
const { findOrCreateUserFromToken } = require('../utils/userUtils');
const { getGeolocation } = require('../services/ipinfoService');
const Subscription = require('../models/Subscription');
const LoginHistory = require('../models/LoginHistory');
const bcrypt = require('bcryptjs');

const login = async (req, res) => {
  const log = req.log;
  try {
    const { token, email, password } = req.body || {};

    // Superadmin login check
    if (email && password) {
      const adminEmail = process.env.SUPER_ADMIN_EMAIL;
      const adminPass = process.env.SUPER_ADMIN_PASSWORD;
      const adminPassHash = process.env.SUPER_ADMIN_PASSWORD_HASH;

      let isMatch = false;
      if (adminEmail && email === adminEmail) {
        if (adminPassHash) {
          isMatch = await bcrypt.compare(password, adminPassHash);
        } else if (adminPass) {
          const userPassBuffer = Buffer.from(password);
          const envPassBuffer = Buffer.from(adminPass);
          if (userPassBuffer.length === envPassBuffer.length) {
            const crypto = require('crypto');
            isMatch = crypto.timingSafeEqual(userPassBuffer, envPassBuffer);
          }
        }
      }

      if (isMatch) {
        const superadminUID = "superadmin_uid"; // A consistent, unique ID for the superadmin
        const customToken = await admin.auth().createCustomToken(superadminUID, { role: 'superadmin' });
        log.info({ message: "Superadmin login successful", userId: superadminUID });

        const superadminUserObject = {
          uid: superadminUID,
          email: process.env.SUPER_ADMIN_EMAIL,
          name: "Super Admin",
          role: "superadmin",
          isPremium: true, // Superadmins should have all privileges
          isOnboardingComplete: true, // Superadmin is always considered onboarded
        };

        return res.json({
          token: customToken,
          user: superadminUserObject,
        });
      } else {
        log.warn({ message: "Superadmin login failed" });
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    // Firebase token login for regular users
    if (token) {
      log.info("Firebase token login attempt");

      const decodedToken = await admin.auth().verifyIdToken(token, true);
      const user = await findOrCreateUserFromToken(decodedToken);

      if (user) {
        user.lastLoginDevice = req.headers['user-agent'];
        user.lastLoginIp = req.ip;

        const geo = await getGeolocation(req.ip);
        if (geo && geo.loc) {
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

        const loginHistory = new LoginHistory({
          userId: user._id,
          ipAddress: req.ip,
        });
        await loginHistory.save();

        log.info({ message: "User login successful", userId: user.uid });
      }

      if (!user) {
        log.warn("User provisioning failed for Firebase identity");
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
    if (!req.user || typeof req.user.uid !== 'string' || !req.user.uid) {
      log.warn("Attempt to set initial password without authentication.");
      return res.status(401).json({ error: "User not authenticated properly." });
    }

    const { newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 128) {
      log.warn({ uid: req.user.uid }, "Rejected invalid initial password length or type");
      return res.status(400).json({ error: "Password must be between 6 and 128 characters long." });
    }

    const User = require('../models/User');
    const existingUser = await User.findOne({ uid: req.user.uid });

    if (!existingUser) {
      log.warn({ uid: req.user.uid }, "Initial password requested for a missing user");
      return res.status(404).json({ error: "User not found." });
    }

    if (existingUser.mustSetPassword !== true) {
      log.warn({ uid: req.user.uid }, "Initial password setup is not permitted for this account");
      return res.status(400).json({ error: "Password already set or action not allowed." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    // Conditional update prevents two concurrent requests from setting/replacing
    // the initial password after the one-time setup flag has been consumed.
    const result = await User.updateOne(
      { uid: req.user.uid, mustSetPassword: true },
      { $set: { password: passwordHash, mustSetPassword: false } }
    );

    if (result.modifiedCount !== 1) {
      return res.status(400).json({ error: "Password already set or action not allowed." });
    }

    res.json({ message: "Password set successfully." });
    log.info({ uid: req.user.uid }, "Initial password set successfully");
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
