require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const pool = require('../db');
const { generateToken } = require('../utils/tokens');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/email');

const router = express.Router();

// Rate limit login attempts: 10 per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts — please try again in 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

function validate(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ error: errors.array()[0].msg });
  }
  return null;
}

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post(
  '/register',
  [
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please enter a valid email address')
      .normalizeEmail(),
    body('license_plate')
      .trim()
      .isLength({ min: 2, max: 15 })
      .withMessage('License plate must be 2–15 characters')
      .matches(/^[a-zA-Z0-9 \-]+$/)
      .withMessage('License plate may only contain letters, numbers, spaces, and hyphens'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirm_password').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  async (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { email, license_plate, password } = req.body;

    const { rows: existing } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verification_token = generateToken();

    await pool.query(
      `INSERT INTO users (email, license_plate, password_hash, verification_token)
       VALUES ($1, $2, $3, $4)`,
      [email, license_plate.toUpperCase(), password_hash, verification_token]
    );

    try {
      await sendVerificationEmail(email, verification_token);
    } catch (e) {
      console.error('[EMAIL ERROR]', e.message);
    }

    res.status(201).json({
      message: 'Account created! Please check your email to verify your account before logging in.',
    });
  }
);

// ── GET /api/auth/verify-email?token= ─────────────────────────────────────
router.get(
  '/verify-email',
  [query('token').notEmpty().withMessage('Verification token is required')],
  async (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { token } = req.query;
    const { rows } = await pool.query(
      'SELECT id, is_verified FROM users WHERE verification_token = $1',
      [token]
    );
    const user = rows[0];

    if (!user) {
      return res.status(400).send(`
        <html><body style="background:#0a1628;color:#e8f0fe;font-family:sans-serif;text-align:center;padding:60px">
          <h2 style="color:#f87171">Invalid or expired verification link.</h2>
          <a href="/login.html" style="color:#4f8ef7">Go to login</a>
        </body></html>
      `);
    }

    if (user.is_verified) {
      return res.redirect('/login.html?verified=already');
    }

    await pool.query(
      'UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = $1',
      [user.id]
    );

    res.redirect('/login.html?verified=1');
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  [
    body('identifier').trim().notEmpty().withMessage('Email is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { identifier, password } = req.body;

    const { rows } = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [identifier.toLowerCase()]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        error: 'Please verify your email address before logging in. Check your inbox.',
        code: 'UNVERIFIED',
      });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      property_id: user.property_id,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ message: 'Logged in successfully', user: payload });
  }
);

// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────
router.post(
  '/forgot-password',
  [body('email').trim().isEmail().withMessage('Please enter a valid email address').normalizeEmail()],
  async (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { email } = req.body;
    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    const user = rows[0];

    if (user) {
      const reset_token = generateToken();
      const reset_token_expires = Math.floor(Date.now() / 1000) + 3600;

      await pool.query(
        'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
        [reset_token, reset_token_expires, user.id]
      );

      try {
        await sendPasswordResetEmail(email, reset_token);
      } catch (e) {
        console.error('[EMAIL ERROR]', e.message);
      }
    }

    res.json({
      message: 'If that email address is registered, a password reset link has been sent.',
    });
  }
);

// ── POST /api/auth/reset-password ─────────────────────────────────────────
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('confirm_password').custom((val, { req }) => {
      if (val !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  ],
  async (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { token, password } = req.body;
    const now = Math.floor(Date.now() / 1000);

    const { rows } = await pool.query(
      'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > $2',
      [token, now]
    );
    const user = rows[0];

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
      [password_hash, user.id]
    );

    res.json({ message: 'Password updated successfully. You can now log in.' });
  }
);

// ── GET /api/auth/me ───────────────────────────────────────────────────────
const authenticate = require('../middleware/authenticate');

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
