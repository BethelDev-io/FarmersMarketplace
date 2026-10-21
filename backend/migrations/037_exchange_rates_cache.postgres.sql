-- BE-37: Create exchange_rates table to cache rates for fiat snapshot lookup (PostgreSQL)

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  currency TEXT NOT NULL,
  rate REAL NOT NULL,
  fetchedAt TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency_fetched ON exchange_rates(currency, fetchedAt DESC);
