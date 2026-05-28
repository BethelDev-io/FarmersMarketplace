const router = require('express').Router();
const db = require('../db/schema');
const adminAuth = require('../middleware/adminAuth');
const { sendPayment } = require('../stellar');

// GET /api/admin/returns - list all return requests
router.get('/returns', adminAuth, (req, res) => {
  const returns = db.prepare(`
    SELECT r.*, o.total_price, o.shipping_cost, o.stellar_tx_hash AS order_tx_hash,
           p.name AS product_name,
           b.name AS buyer_name, b.email AS buyer_email
    FROM returns r
    JOIN orders o ON r.order_id = o.id
    JOIN products p ON o.product_id = p.id
    JOIN users b ON r.buyer_id = b.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(returns);
});

// POST /api/admin/returns/:id/approve
router.post('/returns/:id/approve', adminAuth, async (req, res) => {
  const ret = db.prepare(`
    SELECT r.*,
           o.total_price, o.shipping_cost,
           b.stellar_public_key AS buyer_wallet,
           f.stellar_secret_key AS farmer_secret
    FROM returns r
    JOIN orders o ON r.order_id = o.id
    JOIN users b ON r.buyer_id = b.id
    JOIN products p ON o.product_id = p.id
    JOIN users f ON p.farmer_id = f.id
    WHERE r.id = ?
  `).get(req.params.id);

  if (!ret) return res.status(404).json({ error: 'Return request not found' });
  if (ret.status !== 'pending') return res.status(400).json({ error: `Return already ${ret.status}` });

  const refundAmount = ret.total_price + (ret.shipping_cost || 0);

  try {
    const txHash = await sendPayment({
      senderSecret: ret.farmer_secret,
      receiverPublicKey: ret.buyer_wallet,
      amount: refundAmount,
      memo: `Refund#${ret.id}`,
    });

    db.prepare('UPDATE returns SET status = ?, refund_tx_hash = ? WHERE id = ?')
      .run('approved', txHash, ret.id);

    res.json({ message: 'Return approved and refund issued', refundAmount, txHash });
  } catch (err) {
    res.status(500).json({ error: 'Refund transaction failed: ' + err.message });
  }
});

// POST /api/admin/returns/:id/reject
router.post('/returns/:id/reject', adminAuth, (req, res) => {
  const ret = db.prepare('SELECT * FROM returns WHERE id = ?').get(req.params.id);
  if (!ret) return res.status(404).json({ error: 'Return request not found' });
  if (ret.status !== 'pending') return res.status(400).json({ error: `Return already ${ret.status}` });

  db.prepare('UPDATE returns SET status = ? WHERE id = ?').run('rejected', ret.id);
  res.json({ message: 'Return request rejected' });
});

module.exports = router;
