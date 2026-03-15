require('dotenv').config();
const express   = require('express');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const pool = require('../db');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts — try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

function firstError(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ error: errors.array()[0].msg });
    return true;
  }
  return false;
}

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('email')
      .trim().isEmail().withMessage('Please enter a valid email address')
      .normalizeEmail(),
    body('license_plate')
      .trim()
      .isLength({ min: 2, max: 15 }).withMessage('License plate must be 2–15 characters')
      .matches(/^[a-zA-Z0-9 \-]+$/).withMessage('License plate: letters, numbers, spaces and hyphens only'),
    body('password')
      .isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('confirm_password')
      .custom((val, { req }) => {
        if (val !== req.body.password) throw new Error('Passwords do not match');
        return true;
      }),
  ],
  async (req, res) => {
    if (firstError(req, res)) return;

    const { email, license_plate, password } = req.body;

    const { rows } = await pool.query(
      'SELECT id FROM customers WHERE email = $1', [email]
    );
    if (rows.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const username = email.split('@')[0];

    await pool.query(
      'INSERT INTO customers (email, username, license_plate, password_hash) VALUES ($1, $2, $3, $4)',
      [email, username, license_plate.toUpperCase(), password_hash]
    );

    res.status(201).json({ message: 'Account created! You can now sign in.' });
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  [
    body('email').trim().isEmail().withMessage('Please enter a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    if (firstError(req, res)) return;

    const { email, password } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM customers WHERE email = $1', [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = { id: user.id, email: user.email, role: user.role };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: 'Signed in', user: payload });
  }
);

// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', (_req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Signed out' });
});

module.exports = router;
