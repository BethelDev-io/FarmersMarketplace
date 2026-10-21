-- BE-40: Add IP, user agent, and request ID to admin_audit_log for comprehensive tracking

ALTER TABLE admin_audit_log ADD COLUMN ip_address TEXT;
ALTER TABLE admin_audit_log ADD COLUMN user_agent TEXT;
ALTER TABLE admin_audit_log ADD COLUMN request_id TEXT;
