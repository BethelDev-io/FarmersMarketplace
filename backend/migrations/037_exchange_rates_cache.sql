-- BE-37: Create exchange_rates table to cache rates for fiat snapshot lookup

CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency TEXT NOT NULL,
  rate REAL NOT NULL,
  fetchedAt DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_fetched ON exchange_rates(currency, fetchedAt DESC);
