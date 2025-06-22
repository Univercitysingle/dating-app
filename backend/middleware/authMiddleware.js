const admin = require("../services/firebaseAdmin");

/**
 * Middleware to verify Firebase ID token and attach user info to req.user.
 * Expects header: Authorization: Bearer <token>
 */
module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // Validate presence and format of Authorization header
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("No or malformed Authorization header");
      }
      return res.status(401).json({ error: "No auth token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("Bearer token missing after split");
      }
      return res.status(401).json({ error: "Invalid auth header format" });
    }

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Attach user information to the request object
    req.user = decodedToken;

    // Continue to next middleware or route
    next();
  } catch (error) {
    // Log error in development
    if (process.env.NODE_ENV !== "production") {
      console.error("Firebase Auth Middleware Error:", error.message || error);
    }

    // Respond with unauthorized error
    return res.status(401).json({
      error: "Unauthorized: Invalid or expired token",
    });
  }
};
