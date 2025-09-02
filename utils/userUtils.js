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

  // If user not found by UID, try to find by email and link the account
  if (decodedToken.email) {
    user = await User.findOne({ email: decodedToken.email });

    if (user) {
      user.uid = decodedToken.uid;
      await user.save();
      return user;
    }
  }

  // If no user found by email, create a new one, but only if the email is verified.
  if (!decodedToken.email_verified) {
    return null;
  }

  const newUser = new User({
    uid: decodedToken.uid,
    email: decodedToken.email,
    name: decodedToken.name || '',
    // Add any other default fields for a new user here
  });

  await newUser.save();
  return newUser;
};

const sanitizeUser = (user, currentUser) => {
  const isSuperAdmin = currentUser.role === 'superadmin';
  const isOwner = currentUser.uid === user.uid;

  if (isSuperAdmin || isOwner) {
    return user.toObject ? user.toObject() : user;
  }

  const sanitizedUser = user.toObject ? { ...user.toObject() } : { ...user };
  delete sanitizedUser.email;
  delete sanitizedUser.mobileNumber;

  return sanitizedUser;
}

module.exports = { findOrCreateUserFromToken, sanitizeUser };
