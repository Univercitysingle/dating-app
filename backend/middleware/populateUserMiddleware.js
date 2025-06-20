const User = require('../models/User'); // Adjust path if necessary
const Subscription = require('../models/Subscription'); // Import Subscription model

/**
 * Middleware to populate req.user with the full user document from the database,
 * and add an 'isPremium' flag based on their subscription status.
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
      console.log(`populateUserMiddleware: No user found in DB for Firebase UID: ${req.user.uid}`);
      return res.status(403).json({ message: "Forbidden: User profile not found in application database." });
    }

    // Convert Mongoose document to a plain JavaScript object to add non-schema properties
    const userObject = userFromDb.toObject();

    // Check for active subscription
    let isPremium = false;
    try {
      const activeSubscription = await Subscription.findOne({
        userId: userObject._id, // Assuming Subscription links via User's MongoDB _id
        status: 'active',
        // Optionally, add endDate check if relevant:
        // endDate: { $gte: new Date() }
      });

      if (activeSubscription) {
        isPremium = true;
      }
    } catch (subError) {
      // Log error fetching subscription, but don't fail the request, just assume not premium.
      console.error(`populateUserMiddleware: Error fetching subscription for user UID ${userObject.uid}:`, subError);
      // isPremium remains false
    }

    userObject.isPremium = isPremium;

    // Replace req.user with the augmented user object
    req.user = userObject;

    next();
  } catch (error) {
    console.error("populateUserMiddleware: Error processing user data:", error);
    return res.status(500).json({ message: "Internal Server Error: Could not retrieve user profile." });
  }
};

module.exports = populateUser;
