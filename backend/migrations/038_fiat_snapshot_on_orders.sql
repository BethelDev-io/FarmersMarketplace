-- BE-37: Add fiat currency snapshot columns to orders table
-- Stores the XLM/fiat exchange rate at order creation time for accurate historical revenue analytics

ALTER TABLE orders ADD COLUMN fiat_currency TEXT;
ALTER TABLE orders ADD COLUMN fiat_rate REAL;
ALTER TABLE orders ADD COLUMN fiat_total REAL;
