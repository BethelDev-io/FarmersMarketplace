ALTER TABLE idempotency_keys DROP COLUMN IF EXISTS response_body;
ALTER TABLE idempotency_keys DROP COLUMN IF EXISTS response_status;
ALTER TABLE idempotency_keys DROP COLUMN IF EXISTS request_hash;
ALTER TABLE idempotency_keys DROP COLUMN IF EXISTS user_id;
