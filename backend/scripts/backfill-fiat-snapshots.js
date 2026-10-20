#!/usr/bin/env node
/**
 * BE-37: Backfill fiat snapshots for historical orders
 * 
 * This script backfills fiat_currency, fiat_rate, and fiat_total columns
 * for orders that were placed before fiat snapshots were implemented.
 * 
 * Uses the exchange rate closest to the order creation time (within 24 hours).
 * Marks orders with approximate fiat values if the rate wasn't captured at order time.
 * 
 * Usage:
 *   node scripts/backfill-fiat-snapshots.js [--dry-run]
 */

require('dotenv').config();
const db = require('../src/db/schema');
const logger = require('../src/logger');

const DRY_RUN = process.argv.includes('--dry-run');

async function backfillFiatSnapshots() {
  logger.info('[Backfill] Starting fiat snapshot backfill', { dryRun: DRY_RUN });

  try {
    // Find orders without fiat snapshots
    const { rows: orders } = await db.query(
      `SELECT id, total_price, created_at 
       FROM orders 
       WHERE fiat_currency IS NULL 
       ORDER BY created_at ASC`
    );

    logger.info(`[Backfill] Found ${orders.length} orders without fiat snapshots`);

    let updated = 0;
    let skipped = 0;

    for (const order of orders) {
      // Find the closest exchange rate within 24 hours of order creation
      const orderTime = new Date(order.created_at).getTime();
      const windowStart = new Date(orderTime - 24 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(orderTime + 24 * 60 * 60 * 1000).toISOString();

      const { rows: rateRows } = await db.query(
        `SELECT rate, fetchedAt 
         FROM exchange_rates 
         WHERE currency = $1 
           AND fetchedAt >= $2 
           AND fetchedAt <= $3
         ORDER BY ABS(EXTRACT(EPOCH FROM (fetchedAt - $4::timestamp))) ASC
         LIMIT 1`,
        ['USD', windowStart, windowEnd, order.created_at]
      );

      if (rateRows[0]) {
        const rate = parseFloat(rateRows[0].rate);
        const fiatTotal = parseFloat((order.total_price * rate).toFixed(2));

        if (!DRY_RUN) {
          await db.query(
            'UPDATE orders SET fiat_currency = $1, fiat_rate = $2, fiat_total = $3 WHERE id = $4',
            ['USD', rate, fiatTotal, order.id]
          );
        }

        updated++;
        if (updated % 100 === 0) {
          logger.info(`[Backfill] Processed ${updated} orders...`);
        }
      } else {
        skipped++;
      }
    }

    logger.info('[Backfill] Completed', {
      total: orders.length,
      updated,
      skipped,
      dryRun: DRY_RUN,
    });

    if (DRY_RUN) {
      logger.info('[Backfill] DRY RUN - no changes were made. Run without --dry-run to apply updates.');
    }

    if (skipped > 0) {
      logger.warn(`[Backfill] ${skipped} orders could not be backfilled (no exchange rate within 24 hours)`);
    }

    process.exit(0);
  } catch (error) {
    logger.error('[Backfill] Failed', { error: error.message });
    process.exit(1);
  }
}

backfillFiatSnapshots();
