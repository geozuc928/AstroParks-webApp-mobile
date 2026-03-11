require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './astroparks.db';
const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  CREATE TABLE IF NOT EXISTS properties (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    location   TEXT,
    manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS users (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    username             TEXT UNIQUE NOT NULL COLLATE NOCASE,
    email                TEXT UNIQUE NOT NULL COLLATE NOCASE,
    phone                TEXT NOT NULL,
    license_plate        TEXT NOT NULL,
    password_hash        TEXT NOT NULL,
    role                 TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','manager','admin')),
    is_verified          INTEGER NOT NULL DEFAULT 0,
    verification_token   TEXT,
    reset_token          TEXT,
    reset_token_expires  INTEGER,
    property_id          INTEGER REFERENCES properties(id) ON DELETE SET NULL,
    created_at           INTEGER DEFAULT (unixepoch())
  );

  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
  CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);
  CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

  CREATE TABLE IF NOT EXISTS calibration_configs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id  TEXT NOT NULL UNIQUE,
    label      TEXT NOT NULL DEFAULT 'Parking Lot',
    img_width  INTEGER,
    img_height INTEGER,
    created_at INTEGER DEFAULT (unixepoch()),
    updated_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS parking_space_polygons (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    config_id      INTEGER NOT NULL REFERENCES calibration_configs(id) ON DELETE CASCADE,
    space_id       INTEGER NOT NULL,
    space_label    TEXT NOT NULL,
    section        TEXT NOT NULL,
    polygon_points TEXT NOT NULL,
    created_at     INTEGER DEFAULT (unixepoch()),
    updated_at     INTEGER DEFAULT (unixepoch()),
    UNIQUE(config_id, space_id)
  );

  CREATE INDEX IF NOT EXISTS idx_polygons_config ON parking_space_polygons(config_id);
`);

// --- Seed default admin user ---
function seedAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@astroparks.io';
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AstroAdmin2024!';

  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?')
    .get(adminEmail, adminUsername);

  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 12);
    db.prepare(`
      INSERT INTO users (username, email, phone, license_plate, password_hash, role, is_verified)
      VALUES (?, ?, ?, ?, ?, 'admin', 1)
    `).run(adminUsername, adminEmail, '0000000000', 'ADMIN-00', hash);
    console.log(`[DB] Admin user seeded: ${adminEmail}`);
  }
}

seedAdmin();

module.exports = db;
