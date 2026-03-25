const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Helper: run a query and return rows
async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

// Helper: run a query and return first row
async function queryOne(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

// Helper: run a query and return result (for INSERT/UPDATE/DELETE)
async function execute(text, params) {
  const result = await pool.query(text, params);
  return result;
}

// Initialize tables
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      phone TEXT,
      role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin', 'cook', 'super_admin')),
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(telegram_id),
      name TEXT NOT NULL,
      address TEXT NOT NULL,
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      is_default BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price DOUBLE PRECISION NOT NULL,
      photo_id TEXT,
      calories INTEGER,
      proteins DOUBLE PRECISION,
      fats DOUBLE PRECISION,
      carbs DOUBLE PRECISION,
      is_daily BOOLEAN DEFAULT FALSE,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS daily_menu (
      id SERIAL PRIMARY KEY,
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      date DATE NOT NULL,
      UNIQUE(menu_item_id, date)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(telegram_id),
      location_id INTEGER REFERENCES locations(id),
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'confirmed', 'cooking', 'ready', 'delivered', 'cancelled')),
      total DOUBLE PRECISION DEFAULT 0,
      note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      quantity INTEGER DEFAULT 1,
      price DOUBLE PRECISION NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(telegram_id),
      order_id INTEGER NOT NULL REFERENCES orders(id),
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      rating INTEGER CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cart (
      id SERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(telegram_id),
      menu_item_id INTEGER NOT NULL REFERENCES menu_items(id),
      quantity INTEGER DEFAULT 1,
      UNIQUE(user_id, menu_item_id)
    );
  `);
  console.log('Database initialized.');
}

module.exports = { pool, query, queryOne, execute, initDB };
