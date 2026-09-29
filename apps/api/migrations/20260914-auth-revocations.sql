BEGIN;
CREATE TABLE IF NOT EXISTS club_auth_revocations (
  token_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS club_auth_revocations_expiry_idx ON club_auth_revocations (expires_at);
COMMIT;
