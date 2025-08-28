const admin = require("../services/firebaseAdmin");
const { findOrCreateUserFromToken } = require('../utils/userUtils');
const Subscription = require('../models/Subscription');

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No auth token provided or malformed header" });
    }

    const token = authHeader.split(" ")[1];

    if (!token || token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: "Invalid auth header format: Token is missing" });
    }

    const decodedToken = await admin.auth().verifyIdToken(token);
    const dbUser = await findOrCreateUserFromToken(decodedToken);

    if (!dbUser) {
      return res.status(403).json({ error: "User provisioning failed. Email may not be verified or token details are insufficient." });
    }

    const userObject = dbUser.toObject();
    req.log.info({ user: userObject }, "User object after toObject()");

    const activeSubscription = await Subscription.findOne({
      userId: userObject._id,
      status: 'active',
    });
    req.log.info({ subscription: activeSubscription }, "Active subscription found");


    userObject.isPremium = !!activeSubscription;
    req.user = userObject;

    next();
  } catch (error) {
    req.log.error({ err: error }, "Error in auth middleware");
    if (error.code && error.code.startsWith('auth/')) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired Firebase token.", details: error.message });
    }

    return res.status(500).json({ error: "Server error during authentication." });
  }
};
