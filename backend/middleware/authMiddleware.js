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
      const errorPayload = { error: "No auth token provided" };
      if (process.env.NODE_ENV !== "production") {
        console.warn("Auth Middleware: No or malformed Authorization header. Responding with:", errorPayload);
      }
      return res.status(401).json(errorPayload);
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      const errorPayload = { error: "Invalid auth header format" };
      if (process.env.NODE_ENV !== "production") {
        console.warn("Auth Middleware: Bearer token missing after split. Responding with:", errorPayload);
      }
      return res.status(401).json(errorPayload);
    }

    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(token);

    // Attach user information to the request object
    req.user = decodedToken;

    // Continue to next middleware or route
    next();
  } catch (error) {
    // Log error in development
    const errorPayload = { error: "Unauthorized: Invalid or expired token" };
    if (process.env.NODE_ENV !== "production") {
      console.error("Firebase Auth Middleware Error:", error.message || error, "Responding with:", errorPayload);
    }

    // Respond with unauthorized error
    return res.status(401).json(errorPayload);
  }
};
