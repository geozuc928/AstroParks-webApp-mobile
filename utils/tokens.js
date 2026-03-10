const crypto = require('crypto');

/**
 * Generate a cryptographically secure random hex token.
 * @param {number} bytes - Number of random bytes (default 32 → 64-char hex string)
 */
function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

module.exports = { generateToken };
