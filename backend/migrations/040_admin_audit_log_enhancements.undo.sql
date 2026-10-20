-- Undo BE-40: Remove IP, user agent, and request ID columns from admin_audit_log

ALTER TABLE admin_audit_log DROP COLUMN IF EXISTS ip_address;
ALTER TABLE admin_audit_log DROP COLUMN IF EXISTS user_agent;
ALTER TABLE admin_audit_log DROP COLUMN IF EXISTS request_id;
