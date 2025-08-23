/**
 * Higher-order function to create role-based authorization middleware.
 * This middleware assumes that a preceding authentication middleware (e.g., validating a JWT or Firebase token)
 * has already run and attached the user object (including their role) to `req.user`.
 *
 * @param {string[]} allowedRoles - An array of role strings that are permitted to access the route.
 * @returns {function} An Express middleware function.
 */
const requireRole = (allowedRoles = []) => {
  return (req, res, next) => {
    try {
      // Ensure authentication middleware has already populated req.user
      if (!req.user || !req.user.role) {
        console.warn(
          `[requireRole] Missing user or role. Path: ${req.originalUrl}, Method: ${req.method}`
        );
        return res.status(403).json({
          success: false,
          message:
            "Forbidden: User role not available or authentication incomplete.",
        });
      }

      // Ensure user's role matches allowed roles
      if (!allowedRoles.includes(req.user.role)) {
        console.warn(
          `[requireRole] Forbidden access. UID: ${
            req.user.uid || "N/A"
          }, Role: ${req.user.role}, Required: ${allowedRoles.join(
            ", "
          )}, Path: ${req.originalUrl}`
        );
        return res.status(403).json({
          success: false,
          message: "Forbidden: You do not have the required permissions.",
        });
      }

      // ✅ User authorized — continue
      next();
    } catch (err) {
      console.error(`[requireRole] Error: ${err.message}`, err);
      return res.status(500).json({
        success: false,
        message: "Internal server error in role validation.",
      });
    }
  };
};

module.exports = { requireRole };
