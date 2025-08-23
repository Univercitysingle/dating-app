/**
 * Higher-order function to create role-based authorization middleware.
 * This middleware assumes that a preceding authentication middleware (e.g., validating a JWT or Firebase token)
 * has already run and attached the user object (including their role) to `req.user`.
 *
 * @param {string[]} allowedRoles - An array of role strings that are permitted to access the route.
 * @returns {function} An Express middleware function.
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    // Check if req.user and req.user.role exist.
    // req.user should be populated by a preceding authentication middleware.
    // req.user.role should be populated from the user's document in the database.
    if (!req.user || !req.user.role) {
      // This case might indicate an issue with the preceding auth middleware or user data integrity.
      console.warn('requireRole: req.user or req.user.role is missing. Ensure auth middleware runs first and populates user details including role from DB.');
      return res.status(403).json({ message: "Forbidden: User role not available or authentication incomplete." });
    }

    // Check if the user's role is included in the list of allowed roles.
    if (!allowedRoles.includes(req.user.role)) {
      console.log(`Forbidden access attempt by UID: ${req.user.uid || 'N/A'}, Role: ${req.user.role}, Required: ${allowedRoles.join(', ')} for ${req.originalUrl}`);
      return res.status(403).json({ message: "Forbidden: You do not have the required permissions." });
    }

    // If the user has one of the required roles, pass control to the next handler.
    next();
  };
};

module.exports = { requireRole };
