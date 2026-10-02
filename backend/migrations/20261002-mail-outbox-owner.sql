BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE club_mail_outbox ADD COLUMN IF NOT EXISTS owner_user_id uuid;
COMMIT;
