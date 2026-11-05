const VALID_ROLES = new Set(['user', 'contributor', 'admin', 'superadmin']);

/**
 * Creates database/verified-token role authorization middleware.
 * Authentication must run first and populate req.user from a verified identity.
 */
const requireRole = (allowedRoles) => {
  const configurationIsValid =
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    allowedRoles.every((role) => typeof role === 'string' && VALID_ROLES.has(role));

  return (req, res, next) => {
    if (!configurationIsValid) {
      if (req.log && typeof req.log.error === 'function') {
        req.log.error('Invalid role authorization middleware configuration');
      }
      return res.status(500).json({ message: 'Authorization configuration error.' });
    }

    const role = req.user && req.user.role;
    if (typeof role !== 'string' || !VALID_ROLES.has(role)) {
      if (req.log && typeof req.log.warn === 'function') {
        req.log.warn({ authenticated: Boolean(req.user) }, 'Authorization denied: missing or invalid role');
      }
      return res.status(403).json({ message: 'Forbidden: User role not available or authentication incomplete.' });
    }

    if (!allowedRoles.includes(role)) {
      if (req.log && typeof req.log.warn === 'function') {
        req.log.warn({ role, requiredRoles: allowedRoles }, 'Authorization denied: insufficient role');
      }
      return res.status(403).json({ message: 'Forbidden: You do not have the required permissions.' });
    }

    return next();
  };
};

module.exports = { requireRole };
