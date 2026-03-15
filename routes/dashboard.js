const express = require('express');
const { body, validationResult } = require('express-validator');

const pool = require('../db');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

const router = express.Router();

// All dashboard routes require authentication
router.use(authenticate);

// ── GET /api/dashboard/users ── Admin: all users ───────────────────────────
router.get('/users', authorize('admin'), async (req, res) => {
  const { rows: users } = await pool.query(`
    SELECT
      u.id, u.email, u.license_plate,
      u.role, u.is_verified, u.created_at,
      p.name AS property_name
    FROM users u
    LEFT JOIN properties p ON u.property_id = p.id
    ORDER BY u.created_at DESC
  `);
  res.json({ users });
});

// ── GET /api/dashboard/my-users ── Manager: users at their property ────────
router.get('/my-users', authorize('admin', 'manager'), async (req, res) => {
  let users;

  if (req.user.role === 'admin') {
    const { rows } = await pool.query(`
      SELECT
        u.id, u.email, u.license_plate,
        u.role, u.is_verified, u.created_at,
        p.name AS property_name
      FROM users u
      LEFT JOIN properties p ON u.property_id = p.id
      ORDER BY u.created_at DESC
    `);
    users = rows;
  } else {
    if (!req.user.property_id) {
      return res.json({ users: [], message: 'No property assigned to your account yet.' });
    }
    const { rows } = await pool.query(`
      SELECT
        u.id, u.email, u.license_plate,
        u.role, u.is_verified, u.created_at
      FROM users u
      WHERE u.property_id = $1
      ORDER BY u.created_at DESC
    `, [req.user.property_id]);
    users = rows;
  }

  res.json({ users });
});

// ── GET /api/dashboard/properties ── Admin: all properties ────────────────
router.get('/properties', authorize('admin'), async (req, res) => {
  const { rows: properties } = await pool.query(`
    SELECT p.*, u.email AS manager_email
    FROM properties p
    LEFT JOIN users u ON p.manager_id = u.id
    ORDER BY p.created_at DESC
  `);
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array()[0].msg });
    }
    const { name, location } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO properties (name, location) VALUES ($1, $2) RETURNING id',
      [name, location || null]
    );
    res.status(201).json({ id: rows[0].id, name, location });
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
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array()[0].msg });
    }

    const userId = Number(req.params.id);
    const { role } = req.body;

    if (userId === req.user.id && role !== 'admin') {
      return res.status(400).json({ error: 'You cannot change your own admin role' });
    }

    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    res.json({ message: 'Role updated', userId, role });
  }
);

// ── PATCH /api/dashboard/users/:id/property ── Admin: assign property ─────
router.patch(
  '/users/:id/property',
  authorize('admin'),
  [body('property_id').isInt({ min: 1 }).withMessage('Valid property ID is required')],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: errors.array()[0].msg });
    }

    const userId = Number(req.params.id);
    const { property_id } = req.body;

    const { rows: propRows } = await pool.query('SELECT id FROM properties WHERE id = $1', [property_id]);
    if (propRows.length === 0) {
      return res.status(404).json({ error: 'Property not found' });
    }

    await pool.query('UPDATE users SET property_id = $1 WHERE id = $2', [property_id, userId]);
    res.json({ message: 'Property assigned', userId, property_id });
  }
);

// ── DELETE /api/dashboard/users/:id ── Admin: delete user ─────────────────
router.delete('/users/:id', authorize('admin'), async (req, res) => {
  const userId = Number(req.params.id);
  if (userId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own account from here' });
  }
  const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ message: 'User deleted' });
});

module.exports = router;
