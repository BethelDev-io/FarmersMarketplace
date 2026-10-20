const crypto = require('crypto');
const db = require('../db/schema');

const PENDING_RESPONSE = '{"__idempotency_pending":true}';

function getScopedKey(key, userId) {
  return userId == null ? key : `${userId}:${key}`;
}

// Serializes with sorted object keys so that key order alone never changes the hash.
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function hashRequestBody(body) {
  return crypto.createHash('sha256').update(canonicalJson(body ?? null)).digest('hex');
}

async function getCachedResponse(key, userId) {
  if (!key) return null;
  const { rows } = await db.query(
    'SELECT response, expires_at FROM idempotency_keys WHERE key = $1',
    [getScopedKey(key, userId)]
  );
  const row = rows[0];
  if (row) {
    if (new Date(row.expires_at) > new Date()) {
      try {
        const response = JSON.parse(row.response);
        return response?.__idempotency_pending === true ? null : response;
      } catch {
        return null;
      }
    }
    await db.query('DELETE FROM idempotency_keys WHERE key = $1', [getScopedKey(key, userId)]);
  }
  return null;
}

async function claimIdempotencyKey(userId, key, ttlSeconds, requestHash = null) {
  if (!key || userId == null) throw new Error('A user and idempotency key are required');
  const ttl = ttlSeconds ?? (parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttl * 1000).toISOString();
  const scopedKey = getScopedKey(key, userId);
  const { rows } = await db.query(
    `INSERT INTO idempotency_keys (key, user_id, request_hash, response, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE
       SET user_id = EXCLUDED.user_id, request_hash = EXCLUDED.request_hash,
           response = EXCLUDED.response, expires_at = EXCLUDED.expires_at
       WHERE idempotency_keys.expires_at <= $6
     RETURNING key`,
    [scopedKey, userId, requestHash, PENDING_RESPONSE, expiresAt, now.toISOString()]
  );
  if (rows.length) return { status: 'claimed' };

  const { rows: existingRows } = await db.query(
    'SELECT response, expires_at, request_hash FROM idempotency_keys WHERE key = $1',
    [scopedKey]
  );
  const existing = existingRows[0];
  if (existing && new Date(existing.expires_at) > now) {
    // Same key with a different body is a client bug, not a retry: never replay it.
    if (existing.request_hash && requestHash && existing.request_hash !== requestHash) {
      return { status: 'reused' };
    }
    try {
      const response = JSON.parse(existing.response);
      if (response?.__idempotency_pending !== true) {
        return { status: 'cached', response };
      }
    } catch {
      // Keep an invalid or pending entry locked rather than risk repeating a payment.
    }
  }
  return { status: 'in_progress' };
}

async function releaseIdempotencyKey(key, userId) {
  if (!key || userId == null) return;
  await db.query(
    'DELETE FROM idempotency_keys WHERE key = $1 AND response = $2',
    [getScopedKey(key, userId), PENDING_RESPONSE]
  );
}

async function cacheResponse(key, response, ttlSeconds, userId) {
  if (!key) return;
  const ttl = ttlSeconds ?? (parseInt(process.env.IDEMPOTENCY_TTL_SECONDS, 10) || 86400);
  const expiresAt = new Date(Date.now() + ttl * 1000).toISOString();
  const body = JSON.stringify(response);
  await db.query(
    `INSERT INTO idempotency_keys (key, user_id, response, response_status, response_body, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (key) DO UPDATE
       SET response = EXCLUDED.response, response_status = EXCLUDED.response_status,
           response_body = EXCLUDED.response_body, expires_at = EXCLUDED.expires_at`,
    [getScopedKey(key, userId), userId ?? null, body, response?._status ?? null, body, expiresAt]
  );
}

module.exports = {
  getCachedResponse,
  claimIdempotencyKey,
  releaseIdempotencyKey,
  cacheResponse,
  hashRequestBody,
};
