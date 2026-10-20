const db = require('../db/schema');
const logger = require('../logger');

/**
 * Deletes idempotency keys created more than 24 hours ago (#1460).
 * @returns {number} Number of keys deleted
 */
async function purgeIdempotencyKeys() {
  const query = db.isPostgres
    ? "DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '24 hours'"
    : "DELETE FROM idempotency_keys WHERE created_at < datetime('now', '-24 hours')";

  const result = await db.query(query);
  const count = result.rowCount;
  if (count > 0) {
    logger.info(`[idempotency-purge] Removed ${count} idempotency key(s) older than 24 hours`);
  }
  return count;
}

module.exports = { purgeIdempotencyKeys };
