const router = require('express').Router();
const db = require('../db/schema');
const auth = require('../middleware/auth');
const { sendPayment } = require('../stellar');

// XLM per kg per km
const SHIPPING_RATE = 0.001;

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// POST /api/orders - buyer places + pays for an order
router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'buyer')
    return res.status(403).json({ error: 'Only buyers can place orders' });

  const { product_id, quantity, delivery_lat, delivery_lng } = req.body;
  if (!product_id || !quantity)
    return res.status(400).json({ error: 'product_id and quantity required' });

  const product = db.prepare(`
    SELECT p.*, u.stellar_public_key AS farmer_wallet, u.farm_lat, u.farm_lng
    FROM products p JOIN users u ON p.farmer_id = u.id
    WHERE p.id = ?
  `).get(product_id);

  if (!product) return res.status(404).json({ error: 'Product not found' });
  if (product.quantity < quantity) return res.status(400).json({ error: 'Insufficient stock' });

  // #616 — reject if product is not yet available per scheduling
  const schedule = db.prepare('SELECT available_from FROM product_scheduling WHERE product_id = ?')
    .get(product_id);
  if (schedule && new Date(schedule.available_from) > new Date()) {
    return res.status(400).json({
      error: 'Product not yet available for order',
      available_from: schedule.available_from,
    });
  }

  const buyer = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const itemTotal = product.price * quantity;

  // #617 — weight-based shipping cost
  let shippingCost = 0;
  if (
    delivery_lat != null && delivery_lng != null &&
    product.farm_lat != null && product.farm_lng != null
  ) {
    const distKm = haversineKm(product.farm_lat, product.farm_lng, delivery_lat, delivery_lng);
    const totalWeightKg = (product.weight_kg || 1.0) * quantity;
    shippingCost = parseFloat((totalWeightKg * distKm * SHIPPING_RATE).toFixed(7));
  }

  const grandTotal = parseFloat((itemTotal + shippingCost).toFixed(7));

  const order = db.prepare(
    'INSERT INTO orders (buyer_id, product_id, quantity, total_price, shipping_cost, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.user.id, product_id, quantity, grandTotal, shippingCost, 'pending');

  const orderId = order.lastInsertRowid;

  try {
    const txHash = await sendPayment({
      senderSecret: buyer.stellar_secret_key,
      receiverPublicKey: product.farmer_wallet,
      amount: grandTotal,
      memo: `Order#${orderId}`,
    });

    db.prepare('UPDATE orders SET status = ?, stellar_tx_hash = ? WHERE id = ?').run('paid', txHash, orderId);
    db.prepare('UPDATE products SET quantity = quantity - ? WHERE id = ?').run(quantity, product_id);

    res.json({ orderId, status: 'paid', txHash, itemTotal, shippingCost, grandTotal });
  } catch (err) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('failed', orderId);
    res.status(402).json({ error: 'Payment failed: ' + err.message, orderId });
  }
});

// GET /api/orders - buyer's order history
router.get('/', auth, (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, p.name AS product_name, p.unit, u.name AS farmer_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    JOIN users u ON p.farmer_id = u.id
    WHERE o.buyer_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);
  res.json(orders);
});

// GET /api/orders/sales - farmer's incoming orders
router.get('/sales', auth, (req, res) => {
  if (req.user.role !== 'farmer')
    return res.status(403).json({ error: 'Farmers only' });

  const sales = db.prepare(`
    SELECT o.*, p.name AS product_name, u.name AS buyer_name
    FROM orders o
    JOIN products p ON o.product_id = p.id
    JOIN users u ON o.buyer_id = u.id
    WHERE p.farmer_id = ?
    ORDER BY o.created_at DESC
  `).all(req.user.id);
  res.json(sales);
});

module.exports = router;
