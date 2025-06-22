const admin = require("../services/firebaseAdmin");

/**
 * Middleware to verify Firebase ID token and attach user info to req.user.
 * Expects header: Authorization: Bearer <token>
 */
module.exports = async function (req, res, next) {
  console.log("Auth Middleware: Entered."); // General entry log
  try {
    const authHeader = req.headers.authorization;
    console.log("Auth Middleware: Received Authorization Header:", authHeader); // Log the raw header

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      const errorPayload = { error: "No auth token provided or malformed header" };
      console.warn("Auth Middleware: No or malformed Authorization header. Responding with:", errorPayload, "Header was:", authHeader);
      return res.status(401).json(errorPayload);
    }

    const token = authHeader.split(" ")[1];
    console.log("Auth Middleware: Extracted Token:", token); // Log the extracted token

    if (!token || token === 'null' || token === 'undefined') { // More robust check for empty/nullish tokens
      const errorPayload = { error: "Invalid auth header format: Token is missing or null/undefined" };
      console.warn("Auth Middleware: Bearer token missing, null, or undefined after split. Responding with:", errorPayload, "Original Header:", authHeader);
      return res.status(401).json(errorPayload);
    }

    console.log("Auth Middleware: Attempting to verify token with Firebase Admin SDK...");
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("Auth Middleware: Token verified successfully. Decoded token UID:", decodedToken.uid); // Log successful verification

    req.user = decodedToken; // Attach user information to the request object
    console.log("Auth Middleware: req.user populated. Proceeding to next middleware/handler.");
    next(); // Continue to next middleware or route

  } catch (error) {
    const errorPayload = { error: "Unauthorized: Invalid or expired token" };
    console.error("Firebase Auth Middleware Error during token verification:", error.message || error, "Responding with:", errorPayload, "Token that failed:", req.headers.authorization ? req.headers.authorization.split(" ")[1] : 'N/A');
    // Log the stack trace in non-production for more details
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error("Firebase Auth Middleware Error Stack:", error.stack);
    }
    return res.status(401).json(errorPayload);
  }
};
