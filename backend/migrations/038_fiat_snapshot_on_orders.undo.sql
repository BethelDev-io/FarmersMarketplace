-- Undo BE-37: Remove fiat snapshot columns from orders

ALTER TABLE orders DROP COLUMN IF EXISTS fiat_currency;
ALTER TABLE orders DROP COLUMN IF EXISTS fiat_rate;
ALTER TABLE orders DROP COLUMN IF EXISTS fiat_total;
