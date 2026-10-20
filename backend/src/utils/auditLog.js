'use strict';

/**
 * Admin audit log utility.
 *
 * Writes a row to admin_audit_log for each sensitive admin action.
 * Non-fatal: logs an error but never throws, so callers are not broken
 * by an audit failure.
 *
 * #1028, BE-40
 */

const db = require('../db/schema');
const logger = require('../logger');

/**
 * Write an audit log entry.
 *
 * @param {object} params
 * @param {number}       params.adminId     — ID of the acting admin
 * @param {string}       params.action      — Short snake_case action name
 *                                            e.g. 'ban_user', 'resolve_dispute', 'contract_simulate'
 * @param {string}       params.targetType  — Entity kind: 'user', 'dispute', 'contract', 'order'
 * @param {string|number|null} [params.targetId]  — ID of the affected entity
 * @param {object|null}  [params.before]    — JSON-serializable snapshot before the action
 * @param {object|null}  [params.after]     — JSON-serializable snapshot after the action
 * @param {object}       [params.req]       — Express request object (for IP, user agent, request ID)
 */
async function writeAuditLog({
  adminId,
  action,
  targetType,
  targetId = null,
  before = null,
  after = null,
  req = null,
}) {
  // BE-40: Extract IP, user agent, and request ID from request
  const ipAddress = req ? (req.ip || req.socket?.remoteAddress || null) : null;
  const userAgent = req ? (req.get('user-agent') || null) : null;
  const requestId = req ? (req.get('x-request-id') || null) : null;

  try {
    await db.query(
      `INSERT INTO admin_audit_log
         (admin_id, action, target_type, target_id, before_val, after_val, ip_address, user_agent, request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        adminId,
        action,
        targetType,
        targetId != null ? String(targetId) : null,
        before != null ? JSON.stringify(before) : null,
        after != null ? JSON.stringify(after) : null,
        ipAddress,
        userAgent,
        requestId,
      ],
    );
  } catch (err) {
    // Non-fatal: audit failures must not disrupt admin operations
    logger.error('[audit] Failed to write audit log entry', {
      error: err.message,
      adminId,
      action,
      targetType,
      targetId,
    });
  }
}

module.exports = { writeAuditLog };
