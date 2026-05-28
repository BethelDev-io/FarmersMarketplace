const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../../market.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('farmer', 'buyer', 'admin')),
    stellar_public_key TEXT,
    stellar_secret_key TEXT,
    farm_lat REAL,
    farm_lng REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmer_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    quantity INTEGER NOT NULL,
    unit TEXT DEFAULT 'unit',
    weight_kg REAL DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (farmer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    total_price REAL NOT NULL,
    shipping_cost REAL DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed')),
    stellar_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (buyer_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL UNIQUE,
    buyer_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    refund_tx_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS product_scheduling (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL UNIQUE,
    available_from DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`);

// Migrate existing DB: add new columns (errors mean the column already exists — safe to ignore)
const columnMigrations = [
  'ALTER TABLE products ADD COLUMN weight_kg REAL DEFAULT 1.0',
  'ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0',
  'ALTER TABLE users ADD COLUMN farm_lat REAL',
  'ALTER TABLE users ADD COLUMN farm_lng REAL',
];

for (const sql of columnMigrations) {
  try { db.exec(sql); } catch { /* column already present */ }
}

// Migrate users role CHECK constraint to include 'admin' if needed
const usersRow = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
if (usersRow && !usersRow.sql.includes("'admin'")) {
  db.pragma('foreign_keys = OFF');
  db.exec(`
    CREATE TABLE users_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('farmer', 'buyer', 'admin')),
      stellar_public_key TEXT,
      stellar_secret_key TEXT,
      farm_lat REAL,
      farm_lng REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users_new (id, name, email, password, role, stellar_public_key, stellar_secret_key, created_at)
      SELECT id, name, email, password, role, stellar_public_key, stellar_secret_key, created_at FROM users;
    DROP TABLE users;
    ALTER TABLE users_new RENAME TO users;
  `);
  db.pragma('foreign_keys = ON');
}

module.exports = db;
