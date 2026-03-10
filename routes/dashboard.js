const express = require('express');
const { body, validationResult } = require('express-validator');

const db = require('../db');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// ── GET /api/dashboard/users ── Admin: all users ───────────────────────────
router.get('/users', authorize('admin'), (req, res) => {
  const users = db.prepare(`
    SELECT
      u.id, u.username, u.email, u.phone, u.license_plate,
      u.role, u.is_verified, u.created_at,
      p.name AS property_name
    FROM users u
    LEFT JOIN properties p ON u.property_id = p.id
    ORDER BY u.created_at DESC
  `).all();

  res.json({ users });
});

// ── GET /api/dashboard/my-users ── Manager: users at their property ────────
router.get('/my-users', authorize('admin', 'manager'), (req, res) => {
  let users;

  if (req.user.role === 'admin') {
    users = db.prepare(`
      SELECT
        u.id, u.username, u.email, u.phone, u.license_plate,
        u.role, u.is_verified, u.created_at,
        p.name AS property_name
      FROM users u
      LEFT JOIN properties p ON u.property_id = p.id
      ORDER BY u.created_at DESC
    `).all();
  } else {
    if (!req.user.property_id) {
      return res.json({ users: [], message: 'No property assigned to your account yet.' });
    }
    users = db.prepare(`
      SELECT
        u.id, u.username, u.email, u.phone, u.license_plate,
        u.role, u.is_verified, u.created_at
      FROM users u
      WHERE u.property_id = ?
      ORDER BY u.created_at DESC
    `).all(req.user.property_id);
  }

  res.json({ users });
});

// ── GET /api/dashboard/properties ── Admin: all properties ────────────────
router.get('/properties', authorize('admin'), (req, res) => {
  const properties = db.prepare(`
    SELECT p.*, u.username AS manager_name
    FROM properties p
    LEFT JOIN users u ON p.manager_id = u.id
    ORDER BY p.created_at DESC
  `).all();

  res.json({ properties });
});

// ── POST /api/dashboard/properties ── Admin: create property ──────────────
router.post(
  '/properties',
  authorize('admin'),
  [
    body('name').trim().notEmpty().withMessage('Property name is required'),
    body('location').trim().optional(),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array()[0].msg });
    }
    const { name, location } = req.body;
    const result = db.prepare('INSERT INTO properties (name, location) VALUES (?, ?)').run(name, location || null);
    res.status(201).json({ id: result.lastInsertRowid, name, location });
  }
);

// ── PATCH /api/dashboard/users/:id/role ── Admin: update user role ────────
router.patch(
  '/users/:id/role',
  authorize('admin'),
  [
    body('role')
      .isIn(['user', 'manager', 'admin'])
      .withMessage('Role must be one of: user, manager, admin'),
  ],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array()[0].msg });
    }

    const userId = Number(req.params.id);
    const { role } = req.body;

    // Prevent admin from demoting themselves
    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot change your own admin role' });
    }

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
    res.json({ message: 'Role updated', userId, role });
  }
);

// ── PATCH /api/dashboard/users/:id/property ── Admin: assign property ─────
router.patch(
  '/users/:id/property',
  authorize('admin'),
  [body('property_id').isInt({ min: 1 }).withMessage('Valid property ID is required')],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array()[0].msg });
    }

    const userId = Number(req.params.id);
    const { property_id } = req.body;

    const property = db.prepare('SELECT id FROM properties WHERE id = ?').get(property_id);
    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    db.prepare('UPDATE users SET property_id = ? WHERE id = ?').run(property_id, userId);
    res.json({ message: 'Property assigned', userId, property_id });
  }
);

// ── DELETE /api/dashboard/users/:id ── Admin: delete user ─────────────────
router.delete('/users/:id', authorize('admin'), (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account from here' });
  }
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ message: 'User deleted' });
});

module.exports = router;
