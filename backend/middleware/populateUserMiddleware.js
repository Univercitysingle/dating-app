const User = require('../models/User'); // Adjust path if necessary

/**
 * Middleware to populate req.user with the full user document from the database.
 * This middleware should run AFTER a Firebase authentication middleware that populates
 * req.user with the decoded Firebase token (specifically req.user.uid).
 */
const populateUser = async (req, res, next) => {
  // Check if Firebase auth middleware has run and set req.user and req.user.uid
  if (!req.user || !req.user.uid) {
    // This indicates that the Firebase auth middleware did not authenticate the user
    // or was not run before this middleware.
    console.warn('populateUserMiddleware: req.user or req.user.uid is missing. Ensure Firebase auth middleware runs first.');
    return res.status(401).json({ message: "Unauthorized: Firebase authentication token missing or invalid." });
  }

  try {
    // Fetch the full user profile from MongoDB using the Firebase UID
    // The User model should have a field (e.g., 'uid') that stores the Firebase UID.
    const userFromDb = await User.findOne({ uid: req.user.uid });

    if (!userFromDb) {
      // A valid Firebase token was provided, but the user doesn't exist in our application's database.
      // This could be a user who completed Firebase auth but not app-specific signup steps,
      // or a deleted user whose token is still valid for a short period.
      console.log(`populateUserMiddleware: No user found in DB for Firebase UID: ${req.user.uid}`);
      return res.status(403).json({ message: "Forbidden: User profile not found in application database." });
    }

    // Replace the minimal req.user (from Firebase token) with the full user document from our database.
    // This makes fields like 'role', 'isProfileVisible', etc., available to subsequent middleware/handlers.
    req.user = userFromDb;

    next();
  } catch (error) {
    console.error("populateUserMiddleware: Error fetching user from database:", error);
    return res.status(500).json({ message: "Internal Server Error: Could not retrieve user profile." });
  }
};

module.exports = populateUser;
