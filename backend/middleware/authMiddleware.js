const admin = require("../services/firebaseAdmin");

/**
 * Middleware to verify Firebase ID token and attach user info to req.user.
 * Expects Authorization: Bearer <token> header.
 */
module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Check for Bearer token in Authorization header
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No auth token" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Invalid auth header" });

    // Verify the token with Firebase Admin
    const decoded = await admin.auth().verifyIdToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    // Improved error logging for debugging (remove in production if sensitive)
    if (process.env.NODE_ENV !== "production") {
      console.error("Auth Middleware Error:", error);
    }
    return res.status(401).json({ error: "Unauthorized" });
  }
};
