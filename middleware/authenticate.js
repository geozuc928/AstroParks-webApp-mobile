require('dotenv').config();
const jwt = require('jsonwebtoken');

/**
 * Middleware: verify JWT from httpOnly cookie and attach req.user.
 * Responds 401 if missing or invalid.
 */
function authenticate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, username, email, role, property_id }
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired — please log in again' });
  }
}

module.exports = authenticate;
