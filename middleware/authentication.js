const admin = require("../services/firebaseAdmin");
const { findOrCreateUserFromToken } = require('../utils/userUtils');
const Subscription = require('../models/Subscription');

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const bearerMatch = typeof authHeader === 'string'
      ? authHeader.match(/^Bearer\s+(\S+)$/i)
      : null;

    if (!bearerMatch) {
      return res.status(401).json({ error: "No auth token provided or malformed header" });
    }

    const token = bearerMatch[1];

    if (token === 'null' || token === 'undefined') {
      return res.status(401).json({ error: "Invalid auth header format: Token is missing" });
    }

    // Check revocation as well as signature, issuer, audience, and expiry.
    const decodedToken = await admin.auth().verifyIdToken(token, true);
    const dbUser = await findOrCreateUserFromToken(decodedToken);

    if (!dbUser) {
      return res.status(403).json({ error: "User provisioning failed. Email may not be verified or token details are insufficient." });
    }

    // Keep the full Mongoose document to preserve virtuals.
    req.user = dbUser;

    const activeSubscription = await Subscription.findOne({
      userId: dbUser._id,
      status: 'active',
    });
    req.log.info({ hasActiveSubscription: Boolean(activeSubscription) }, "Subscription status checked");

    // Dynamically add the isPremium property for this request.
    // This will be handled by the sanitizeUser function.
    req.user.isPremium = !!activeSubscription;

    next();
  } catch (error) {
    req.log.error({ err: error }, "Error in auth middleware");
    if (error.code && error.code.startsWith('auth/')) {
      return res.status(401).json({ error: "Unauthorized: Invalid or expired Firebase token.", details: error.message });
    }

    return res.status(500).json({ error: "Server error during authentication." });
  }
};
