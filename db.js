require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  const client = await pool.connect();
  try {
    // Create users table first (property_id FK added after properties table)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                   SERIAL PRIMARY KEY,
        email                TEXT UNIQUE NOT NULL,
        license_plate        TEXT NOT NULL,
        password_hash        TEXT NOT NULL,
        role                 TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('user','manager','admin')),
        is_verified          INTEGER NOT NULL DEFAULT 0,
        verification_token   TEXT,
        reset_token          TEXT,
        reset_token_expires  BIGINT,
        property_id          INTEGER,
        created_at           BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        location   TEXT,
        manager_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );
    `);

    // Add FK from users.property_id -> properties.id if not already present
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE constraint_name = 'users_property_id_fkey'
            AND table_name = 'users'
        ) THEN
          ALTER TABLE users
            ADD CONSTRAINT users_property_id_fkey
            FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_verification_token ON users(verification_token);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS calibration_configs (
        id         SERIAL PRIMARY KEY,
        camera_id  TEXT NOT NULL UNIQUE,
        label      TEXT NOT NULL DEFAULT 'Parking Lot',
        img_width  INTEGER,
        img_height INTEGER,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parking_space_polygons (
        id             SERIAL PRIMARY KEY,
        config_id      INTEGER NOT NULL REFERENCES calibration_configs(id) ON DELETE CASCADE,
        space_id       INTEGER NOT NULL,
        space_label    TEXT NOT NULL,
        section        TEXT NOT NULL,
        polygon_points TEXT NOT NULL,
        created_at     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        updated_at     BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT,
        UNIQUE(config_id, space_id)
      );
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS idx_polygons_config ON parking_space_polygons(config_id);`);

    await seedAdmin(client);
    console.log('[DB] PostgreSQL schema ready');
  } finally {
    client.release();
  }
}

async function seedAdmin(client) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@astroparks.io';
  const adminPassword = process.env.ADMIN_PASSWORD || 'AstroAdmin2024!';

  const { rows } = await client.query(
    'SELECT id FROM users WHERE email = $1',
    [adminEmail]
  );

  if (rows.length === 0) {
    const hash = await bcrypt.hash(adminPassword, 12);
    await client.query(
      `INSERT INTO users (email, license_plate, password_hash, role, is_verified)
       VALUES ($1, $2, $3, 'admin', 1)`,
      [adminEmail, 'ADMIN-00', hash]
    );
    console.log(`[DB] Admin user seeded: ${adminEmail}`);
  }
}

initDb().catch(err => {
  console.error('[DB] Initialization failed:', err);
  process.exit(1);
});

module.exports = pool;
