-- Add indexes for hot query paths to improve performance
-- Issue #1469: BE-25

-- Orders indexes for buyer queries and payment confirmation job
CREATE INDEX IF NOT EXISTS idx_orders_buyer_created ON orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- Products indexes for farmer and category filtering
CREATE INDEX IF NOT EXISTS idx_products_farmer ON products(farmer_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- Messages index for recipient inbox queries
CREATE INDEX IF NOT EXISTS idx_messages_recipient_read ON messages(recipient_id, read);

-- Notifications index for user notification feed
CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);

-- Reviews index for product review filtering
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);
