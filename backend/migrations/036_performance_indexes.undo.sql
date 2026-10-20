-- Rollback performance indexes
-- Issue #1469: BE-25

DROP INDEX IF EXISTS idx_orders_buyer_created;
DROP INDEX IF EXISTS idx_orders_product;
DROP INDEX IF EXISTS idx_orders_status;
DROP INDEX IF EXISTS idx_products_farmer;
DROP INDEX IF EXISTS idx_products_category;
DROP INDEX IF EXISTS idx_messages_recipient_read;
DROP INDEX IF EXISTS idx_notifications_user_created;
DROP INDEX IF EXISTS idx_reviews_product_status;
