require('dotenv').config();
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired — please sign in again' });
  }
}

module.exports = authenticate;
