const User = require('../models/User');

/**
 * Finds an existing user or creates a new one based on a decoded Firebase token.
 *
 * This function first tries to find a user by their Firebase UID. If not found,
 * it searches by email. If a user with that email exists, it links the Firebase
 * UID to that account. If no user is found by either UID or email, a new user
 * is created in the database.
 *
 * @param {object} decodedToken - The decoded Firebase ID token.
 * @returns {Promise<object|null>} The Mongoose user object or null if the token
 * is missing required details (e.g., a verified email for a new user).
 */
const findOrCreateUserFromToken = async (decodedToken) => {
  if (!decodedToken || !decodedToken.uid) {
    return null;
  }

  let user = await User.findOne({ uid: decodedToken.uid });

  if (user) {
    return user;
  }

  // Never link a Firebase identity to an existing account using an unverified email.
  // A verified UID match above remains valid because Firebase authenticated that UID.
  if (decodedToken.email_verified !== true) {
    return null;
  }

  // If user not found by UID, link only through a verified email address.
  if (decodedToken.email) {
    user = await User.findOne({ email: decodedToken.email });

    if (user) {
      user.uid = decodedToken.uid;
      await user.save();
      return user;
    }
  }

  // New accounts are provisioned only from verified Firebase email identities.

  const newUser = new User({
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name || '',
    trialExpires: new Date(Date.now() + 48 * 60 * 60 * 1000),
    // Add any other default fields for a new user here
  });

  await newUser.save();
  return newUser;
};

const { convertKeysToCdnUrls } = require('./cdnUtils');

const sanitizeUser = (user, currentUser) => {
  const isSuperAdmin = currentUser && currentUser.role === 'superadmin';
  const isOwner = currentUser && user && currentUser.uid === user.uid;

  // Ensure we have a plain object to work with, whether it's a Mongoose doc or a plain object.
  let userObject = (user && typeof user.toObject === 'function') ? user.toObject() : { ...user };

  // Password hashes and internal authentication metadata must never be
  // serialized by profile endpoints, including to the owner or superadmins.
  delete userObject.password;

  // Always convert photo URLs to full CDN paths.
  userObject = convertKeysToCdnUrls(userObject);

  // Owners and superadmins may see the remaining account details.
  if (isSuperAdmin || isOwner) {
    return userObject;
  }

  // Public profile responses must not expose contact, security, or moderation data.
  delete userObject.email;
  delete userObject.mobileNumber;
  delete userObject.lastLoginIp;
  delete userObject.lastLoginDevice;
  delete userObject.mustSetPassword;
  delete userObject.blocked;
  delete userObject.suspendedUntil;

  return userObject;
}

module.exports = { findOrCreateUserFromToken, sanitizeUser };
