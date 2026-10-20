const db = require('../db/schema');

const ALLOWED_TRANSITIONS = Object.freeze({
  pending: ['confirming', 'paid', 'failed', 'refunded'],
  confirming: ['paid', 'failed', 'refunded'],
  paid: ['processing', 'shipped', 'delivered', 'disputed', 'refunded'],
  processing: ['shipped', 'delivered', 'disputed', 'refunded'],
  shipped: ['delivered', 'returned', 'disputed'],
  delivered: ['returned', 'disputed'],
  disputed: ['paid', 'refunded', 'returned'],
  failed: [],
  refunded: [],
  returned: [],
});

const FINAL_STATUSES = Object.freeze(['failed', 'refunded', 'returned', 'delivered']);

function isAllowedTransition(from, to) {
  return from === to || (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

function invalidTransitionError(from, to) {
  const error = new Error(`Cannot transition order from ${from} to ${to}`);
  error.status = 409;
  error.code = 'invalid_status_transition';
  return error;
}

/**
 * Atomically transition an order and append an audit record.
 * `from` may be one status or a list of statuses accepted by this operation.
 */
async function transition(orderId, from, to, meta = {}) {
  const fromStatuses = Array.isArray(from) ? from : [from];
  if (!fromStatuses.some((status) => isAllowedTransition(status, to))) {
    throw invalidTransitionError(fromStatuses.join('|'), to);
  }
  const actor = meta.actor || meta.actorId || null;
  const reason = meta.reason || null;

  return db.withTransaction(async (tx) => {
    const placeholders = fromStatuses.map((_, index) => `$${index + 2}`).join(', ');
    const params = [orderId, ...fromStatuses, to];
    const { rows } = await tx.query(
      `UPDATE orders
       SET status = $${fromStatuses.length + 2}
       WHERE id = $1 AND status IN (${placeholders})
       RETURNING id, status`,
      params
    );
    if (!rows[0]) {
      const current = await tx.query('SELECT status FROM orders WHERE id = $1', [orderId]);
      throw invalidTransitionError(current.rows[0]?.status || 'missing', to);
    }
    await tx.query(
      `INSERT INTO order_status_history (order_id, actor, from_status, to_status, reason)
       VALUES ($1, $2, $3, $4, $5)`,
      [orderId, actor, fromStatuses.join(','), to, reason]
    );
    return rows[0];
  });
}

async function transitionFromCurrent(orderId, to, meta = {}) {
  const { rows } = await db.query('SELECT status FROM orders WHERE id = $1', [orderId]);
  if (!rows[0]) throw invalidTransitionError('missing', to);
  return transition(orderId, rows[0].status, to, meta);
}

module.exports = { ALLOWED_TRANSITIONS, FINAL_STATUSES, isAllowedTransition, transition, transitionFromCurrent, invalidTransitionError };
