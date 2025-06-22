const admin = require("../services/firebaseAdmin");
const { findAndUpdateUserByTokenDetails } = require("../controllers/usersController");

/**
 * Middleware to verify Firebase ID token, find/create/update user in DB,
 * and attach DB user profile to req.user.
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
    console.log("Auth Middleware: Firebase token verified successfully. Decoded token UID:", decodedToken.uid, "Email:", decodedToken.email, "Email Verified:", decodedToken.email_verified);

    // Now, find/update/create user in our database
    const dbUser = await findAndUpdateUserByTokenDetails(decodedToken);

    if (!dbUser) {
      // This case handles when findAndUpdateUserByTokenDetails returns null
      // (e.g., email not verified and no existing UID match, or token has no email)
      console.warn("Auth Middleware: Could not provision user from token details (e.g., email not verified or missing, and no existing UID). Denying access.");
      const errorPayload = { error: "User provisioning failed. Email may not be verified or token details are insufficient." };
      return res.status(403).json(errorPayload); // 403 Forbidden as user is authenticated by Firebase but not authorized in our app
    }

    req.user = dbUser; // Attach our database user profile to req.user
    console.log("Auth Middleware: Database user profile attached to req.user. Proceeding.");
    next();

  } catch (error) {
    // Handle errors from Firebase token verification OR from findAndUpdateUserByTokenDetails if it throws
    console.error("Auth Middleware: Error during token verification or user provisioning:", error.message || error, "Token that potentially failed:", token);
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error("Auth Middleware Error Stack:", error.stack);
    }

    // Determine if the error is specifically a Firebase token verification error
    // Firebase errors often have a 'code' property like 'auth/id-token-expired'
    if (error.code && error.code.startsWith('auth/')) {
      const errorPayload = { error: "Unauthorized: Invalid or expired Firebase token.", details: error.message };
      return res.status(401).json(errorPayload);
    }

    // For other errors (e.g., database issues from findAndUpdateUserByTokenDetails)
    const errorPayload = { error: "Server error during authentication." };
    return res.status(500).json(errorPayload);
    // Log the stack trace in non-production for more details
    if (process.env.NODE_ENV !== "production" && error.stack) {
      console.error("Firebase Auth Middleware Error Stack:", error.stack);
    }
    return res.status(401).json(errorPayload);
  }
};
