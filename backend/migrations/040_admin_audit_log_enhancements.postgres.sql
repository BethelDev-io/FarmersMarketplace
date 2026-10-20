-- BE-40: Add IP, user agent, and request ID to admin_audit_log for comprehensive tracking (PostgreSQL)

ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE admin_audit_log ADD COLUMN IF NOT EXISTS request_id TEXT;

-- BE-40: Add trigger to prevent UPDATE/DELETE on audit log (append-only enforcement)
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only: UPDATE and DELETE operations are not allowed';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_prevent_update ON admin_audit_log;
CREATE TRIGGER audit_log_prevent_update
  BEFORE UPDATE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();

DROP TRIGGER IF EXISTS audit_log_prevent_delete ON admin_audit_log;
CREATE TRIGGER audit_log_prevent_delete
  BEFORE DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_modification();
