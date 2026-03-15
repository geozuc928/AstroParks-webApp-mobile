require('dotenv').config();
const { Pool } = require('pg');
const bcrypt   = require('bcryptjs');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function initDb() {
  const client = await pool.connect();
  try {
    // Use the existing customers table — add missing auth columns if not present
    await client.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS password_hash TEXT,
        ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
                                        CHECK(role IN ('user', 'admin'));
    `);

    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);`
    );

    // Seed admin account
    const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@astroparks.io';
    const adminPassword = process.env.ADMIN_PASSWORD || 'AstroAdmin2024!';

    const { rows } = await client.query(
      'SELECT id FROM customers WHERE email = $1',
      [adminEmail]
    );

    if (rows.length === 0) {
      const hash = await bcrypt.hash(adminPassword, 12);
      await client.query(
        `INSERT INTO customers (email, username, license_plate, password_hash, role)
         VALUES ($1, $2, $3, $4, 'admin')`,
        [adminEmail, 'admin', 'ADMIN-00', hash]
      );
      console.log(`[DB] Admin seeded: ${adminEmail}`);
    }

    console.log('[DB] Schema ready');
  } finally {
    client.release();
  }
}

initDb().catch(err => {
  console.error('[DB] Failed to connect to PostgreSQL:', err.message);
  console.error('     Check DATABASE_URL in your .env file.');
  console.error('     See .env.example for setup instructions.');
  process.exit(1);
});

module.exports = pool;
