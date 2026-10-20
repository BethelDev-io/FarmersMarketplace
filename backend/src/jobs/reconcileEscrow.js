const db = require('../db/schema');
const logger = require('../logger');
const { getEscrowState } = require('../utils/stellar-contracts');
const { transition, FINAL_STATUSES } = require('../models/orderStatus');

const BATCH_SIZE = 50;
const INTERVAL_MS = parseInt(process.env.ESCROW_RECONCILE_INTERVAL_MS || String(15 * 60 * 1000), 10);
const LOCK_KEY = 1463;

async function acquireLock() {
  if (!db.isPostgres) return { acquired: true, client: null };
  const client = await db.getClient();
  const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [LOCK_KEY]);
  if (!rows[0]?.locked) {
    client.release();
    return { acquired: false, client: null };
  }
  return { acquired: true, client };
}

async function releaseLock(lock) {
  if (lock?.client) {
    try {
      await lock.client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
    } finally {
      lock.client.release();
    }
  }
}

async function createAlert(order, message) {
  await db.query(
    `INSERT INTO contract_alerts (contract_id, alert_type, message)
     VALUES ($1, 'failed_invocations', $2)`,
    [process.env.SOROBAN_ESCROW_CONTRACT_ID || 'escrow', `Order ${order.id}: ${message}`]
  );
}

function chainOutcome(state) {
  const status = String(state?.status || '').toLowerCase();
  if (/release|complete|settled|paid/.test(status)) return 'paid';
  if (/refund|refunded|cancel/.test(status)) return 'refunded';
  if (/fund|active|deliver|disput/.test(status)) return null;
  return undefined;
}

async function reconcileBatch(orders) {
  for (const order of orders) {
    try {
      const chainState = await getEscrowState(order.id);
      if (!chainState) {
        await createAlert(order, `escrow missing on chain; database status is ${order.status}`);
        logger.warn('[EscrowReconcile] Missing chain escrow', { orderId: order.id, dbStatus: order.status });
        continue;
      }
      const target = chainOutcome(chainState);
      if (!target || FINAL_STATUSES.includes(order.status)) continue;
      if (target !== order.status) {
        await transition(order.id, order.status, target, {
          actor: 'escrow-reconciler',
          reason: `chain:${chainState.status}`,
        });
        logger.warn('[EscrowReconcile] Corrected status mismatch', {
          orderId: order.id,
          dbStatus: order.status,
          chainStatus: chainState.status,
          target,
        });
      }
      await db.query('UPDATE orders SET escrow_status = $1 WHERE id = $2', [String(chainState.status).toLowerCase(), order.id]);
    } catch (error) {
      logger.warn('[EscrowReconcile] Order reconciliation failed', {
        orderId: order.id,
        dbStatus: order.status,
        error: error.message,
      });
    }
  }
}

async function reconcileEscrow() {
  const lock = await acquireLock();
  if (!lock.acquired) return { skipped: true, reconciled: 0 };
  try {
    const { rows } = await db.query(
      `SELECT id, status, escrow_status
       FROM orders
       WHERE escrow_balance_id IS NOT NULL
         AND status NOT IN ('failed', 'refunded', 'returned', 'delivered')
       ORDER BY id
       LIMIT 1000`
    );
    let reconciled = 0;
    for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
      const batch = rows.slice(offset, offset + BATCH_SIZE);
      await reconcileBatch(batch);
      reconciled += batch.length;
    }
    return { skipped: false, reconciled };
  } finally {
    await releaseLock(lock);
  }
}

function start() {
  const run = () => reconcileEscrow().catch((error) => logger.error('[EscrowReconcile] Job failed', { error: error.message }));
  run();
  return setInterval(run, INTERVAL_MS);
}

module.exports = { BATCH_SIZE, INTERVAL_MS, reconcileEscrow, reconcileBatch, start };
