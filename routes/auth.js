require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

const db = require('../db');
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

// Helper: send validation errors
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
    body('username')
      .trim()
      .isLength({ min: 3, max: 30 })
      .withMessage('Username must be 3–30 characters')
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage('Username may only contain letters, numbers, and underscores'),
    body('email')
      .trim()
      .isEmail()
      .withMessage('Please enter a valid email address')
      .normalizeEmail(),
    body('phone')
      .trim()
      .matches(/^\+?[\d\s\-().]{7,20}$/)
      .withMessage('Please enter a valid phone number'),
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

    const { username, email, phone, license_plate, password } = req.body;

    // Check uniqueness
    const existing = db
      .prepare('SELECT id FROM users WHERE email = ? OR username = ?')
      .get(email, username);
    if (existing) {
      return res.status(409).json({ error: 'An account with that email or username already exists' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verification_token = generateToken();

    db.prepare(`
      INSERT INTO users (username, email, phone, license_plate, password_hash, verification_token)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(username, email, phone, license_plate.toUpperCase(), password_hash, verification_token);

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
  (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { token } = req.query;
    const user = db
      .prepare('SELECT id, is_verified FROM users WHERE verification_token = ?')
      .get(token);

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

    db.prepare('UPDATE users SET is_verified = 1, verification_token = NULL WHERE id = ?').run(user.id);

    res.redirect('/login.html?verified=1');
  }
);

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post(
  '/login',
  loginLimiter,
  [
    body('identifier').trim().notEmpty().withMessage('Email or username is required'),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  async (req, res) => {
    const err = validate(req, res);
    if (err) return;

    const { identifier, password } = req.body;

    const user = db
      .prepare('SELECT * FROM users WHERE email = ? OR username = ?')
      .get(identifier.toLowerCase(), identifier);

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
      username: user.username,
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
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.json({
      message: 'Logged in successfully',
      user: payload,
    });
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
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    // Always respond the same way to prevent email enumeration
    if (user) {
      const reset_token = generateToken();
      const reset_token_expires = Math.floor(Date.now() / 1000) + 3600; // 1 hour

      db.prepare(
        'UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?'
      ).run(reset_token, reset_token_expires, user.id);

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

    const user = db
      .prepare('SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > ?')
      .get(token, now);

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    db.prepare(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL WHERE id = ?'
    ).run(password_hash, user.id);

    res.json({ message: 'Password updated successfully. You can now log in.' });
  }
);

// ── GET /api/auth/me ───────────────────────────────────────────────────────
const authenticate = require('../middleware/authenticate');

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
