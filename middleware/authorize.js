/**
 * Middleware factory: restrict access to users with one of the allowed roles.
 * Must be used AFTER authenticate middleware.
 *
 * Usage: router.get('/admin-only', authenticate, authorize('admin'), handler)
 *        router.get('/staff',      authenticate, authorize('admin', 'manager'), handler)
 */
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

module.exports = authorize;
