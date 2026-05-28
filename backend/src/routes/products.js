const router = require('express').Router();
const db = require('../db/schema');
const auth = require('../middleware/auth');

// GET /api/products - public browse (hides unscheduled / out-of-stock products)
router.get('/', (req, res) => {
  const products = db.prepare(`
    SELECT p.*, u.name AS farmer_name
    FROM products p
    JOIN users u ON p.farmer_id = u.id
    LEFT JOIN product_scheduling ps ON p.id = ps.product_id
    WHERE p.quantity > 0
      AND (ps.available_from IS NULL OR ps.available_from <= datetime('now'))
    ORDER BY p.created_at DESC
  `).all();
  res.json(products);
});

// GET /api/products/:id
router.get('/:id', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, u.name AS farmer_name, u.stellar_public_key AS farmer_wallet
    FROM products p
    JOIN users u ON p.farmer_id = u.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  // #616 — hide product if not yet available per scheduling
  const schedule = db.prepare('SELECT available_from FROM product_scheduling WHERE product_id = ?')
    .get(product.id);
  if (schedule && new Date(schedule.available_from) > new Date()) {
    return res.status(404).json({
      error: 'Product not yet available',
      available_from: schedule.available_from,
    });
  }

  res.json(product);
});

// POST /api/products - farmer only
router.post('/', auth, (req, res) => {
  if (req.user.role !== 'farmer')
    return res.status(403).json({ error: 'Only farmers can list products' });

  const { name, description, price, quantity, unit, weight_kg, available_from } = req.body;
  if (!name || !price || !quantity)
    return res.status(400).json({ error: 'name, price, quantity required' });

  const result = db.prepare(
    'INSERT INTO products (farmer_id, name, description, price, quantity, unit, weight_kg) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    req.user.id, name, description || '', price, quantity,
    unit || 'unit', weight_kg != null ? weight_kg : 1.0
  );

  const productId = result.lastInsertRowid;

  if (available_from) {
    db.prepare('INSERT INTO product_scheduling (product_id, available_from) VALUES (?, ?)').run(
      productId, available_from
    );
  }

  res.json({ id: productId, message: 'Product listed' });
});

// PUT /api/products/:id/schedule - farmer sets or updates pre-order availability
router.put('/:id/schedule', auth, (req, res) => {
  if (req.user.role !== 'farmer')
    return res.status(403).json({ error: 'Only farmers can schedule products' });

  const product = db.prepare('SELECT id FROM products WHERE id = ? AND farmer_id = ?')
    .get(req.params.id, req.user.id);
  if (!product) return res.status(404).json({ error: 'Product not found or not yours' });

  const { available_from } = req.body;
  if (!available_from)
    return res.status(400).json({ error: 'available_from required (ISO 8601 datetime)' });

  db.prepare(`
    INSERT INTO product_scheduling (product_id, available_from)
    VALUES (?, ?)
    ON CONFLICT(product_id) DO UPDATE SET available_from = excluded.available_from
  `).run(req.params.id, available_from);

  res.json({ message: 'Schedule updated', product_id: req.params.id, available_from });
});

// DELETE /api/products/:id/schedule - farmer removes scheduling (makes immediately available)
router.delete('/:id/schedule', auth, (req, res) => {
  if (req.user.role !== 'farmer')
    return res.status(403).json({ error: 'Farmers only' });

  const product = db.prepare('SELECT id FROM products WHERE id = ? AND farmer_id = ?')
    .get(req.params.id, req.user.id);
  if (!product) return res.status(404).json({ error: 'Product not found or not yours' });

  db.prepare('DELETE FROM product_scheduling WHERE product_id = ?').run(req.params.id);
  res.json({ message: 'Schedule removed, product is now immediately available' });
});

// GET /api/products/mine/list - farmer's own products (includes unscheduled ones)
router.get('/mine/list', auth, (req, res) => {
  if (req.user.role !== 'farmer')
    return res.status(403).json({ error: 'Farmers only' });

  const products = db.prepare(`
    SELECT p.*, ps.available_from
    FROM products p
    LEFT JOIN product_scheduling ps ON p.id = ps.product_id
    WHERE p.farmer_id = ?
    ORDER BY p.created_at DESC
  `).all(req.user.id);
  res.json(products);
});

// DELETE /api/products/:id
router.delete('/:id', auth, (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND farmer_id = ?')
    .get(req.params.id, req.user.id);
  if (!product) return res.status(404).json({ error: 'Not found or not yours' });
  db.prepare('DELETE FROM product_scheduling WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
