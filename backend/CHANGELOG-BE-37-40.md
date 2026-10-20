# Backend Changes: BE-37, BE-38, BE-39, BE-40

## BE-37: Price-in-fiat snapshot on orders ✅

### Problem
Orders stored only XLM amounts. Analytics and receipts couldn't show historical fiat value because XLM is volatile.

### Solution
- Added `orders.fiat_currency`, `orders.fiat_rate`, `orders.fiat_total` columns (nullable)
- Created `exchange_rates` table to cache XLM/USD rates from CoinGecko API
- `routes/rates.js` now persists fetched rates to database
- `routes/orders.js` captures fiat snapshot at order creation (if rate ≤5 min old)
- `routes/analytics.js` aggregates fiat revenue in farmer analytics
- Backfill script provided: `scripts/backfill-fiat-snapshots.js`

### Files Changed
- `migrations/037_exchange_rates_cache.sql` - New table for rate caching
- `migrations/038_fiat_snapshot_on_orders.sql` - Add fiat columns to orders
- `src/routes/rates.js` - Persist rates to DB
- `src/routes/orders.js` - Capture fiat at order creation
- `src/routes/analytics.js` - Include fiat aggregation
- `scripts/backfill-fiat-snapshots.js` - Backfill script (optional, approximate)

### Usage
```bash
# Run migrations
npm run migrate

# Backfill historical orders (dry run)
node scripts/backfill-fiat-snapshots.js --dry-run

# Apply backfill
node scripts/backfill-fiat-snapshots.js
```

---

## BE-38: Messaging — prevent spam and enforce conversation authorization ✅

### Problem
No constraints on messaging: buyers could spam farmers, anyone could message anyone.

### Solution
- **Authorization**: Buyers can only message farmers with active listings or existing orders
- **Rate limits**: 30 messages/min, 200 messages/day per user
- **Character limit**: 2,000 chars per message (sanitized via `sanitize.js`)
- **Block feature**: Users can block other users (403 `blocked` response)
- **Report feature**: Users can report messages; visible in admin dashboard

### Files Changed
- `migrations/039_messaging_spam_prevention.sql` - Add `message_blocks` and `message_reports` tables
- `src/routes/messages.js` - Add rate limits, authorization, block/report endpoints
- `src/routes/admin.js` - Add `GET /api/admin/message-reports` endpoint

### New Endpoints
```
POST   /api/messages/block              - Block a user
DELETE /api/messages/block/:userId      - Unblock a user
GET    /api/messages/blocked            - List blocked users
POST   /api/messages/:messageId/report  - Report a message
GET    /api/admin/message-reports       - View reported messages (admin only)
```

---

## BE-39: OpenAPI spec drift — generate route docs from validators and test them ⏳

### Status
**Not implemented in this PR** - This issue requires:
1. Installing `zod-to-openapi` package
2. Converting all Zod validators to generate OpenAPI schemas
3. Writing tests to validate spec against actual routes
4. Validating spec with `@apidevtools/swagger-parser`

This is a larger refactoring task and should be handled separately.

---

## BE-40: Structured audit logging for all admin actions ✅

### Problem
`admin_audit_log` existed but not all admin mutations wrote to it. Missing IP, user agent, request ID tracking.

### Solution
- Updated `utils/auditLog.js` to capture IP, user agent, request ID from `req` object
- Added audit logging to all admin mutation routes:
  - `POST /api/admin/returns/:id/approve` - approve_return
  - `POST /api/admin/returns/:id/reject` - reject_return
  - `DELETE /api/admin/users/:id` - deactivate_user
- Enhanced `routes/adminAuditLog.js`:
  - Added `action` filter
  - Added CSV export (`?format=csv`)
  - Returns IP, user agent, request ID in responses
- PostgreSQL: Added triggers to enforce append-only (no UPDATE/DELETE)

### Files Changed
- `migrations/040_admin_audit_log_enhancements.sql` - Add IP/UA/request_id columns
- `migrations/040_admin_audit_log_enhancements.postgres.sql` - Add append-only triggers
- `src/utils/auditLog.js` - Capture req metadata
- `src/routes/admin.js` - Add audit logging to mutations
- `src/routes/adminAuditLog.js` - Add filters, CSV export

### CSV Export
```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  'http://localhost:4000/api/admin/audit-log?format=csv&from=2024-01-01' \
  -o audit-log.csv
```

---

## Migration Order
1. `037_exchange_rates_cache.sql`
2. `038_fiat_snapshot_on_orders.sql`
3. `039_messaging_spam_prevention.sql`
4. `040_admin_audit_log_enhancements.sql`

## Testing
```bash
# Run migrations
npm run migrate

# Run tests (if implemented)
npm test

# Start server
npm start
```

## Notes
- **BE-37**: Fiat snapshots are best-effort (non-fatal if rate unavailable)
- **BE-38**: Links in messages are sanitized to plain text
- **BE-39**: Deferred to separate PR
- **BE-40**: PostgreSQL append-only enforced via triggers; SQLite is advisory
