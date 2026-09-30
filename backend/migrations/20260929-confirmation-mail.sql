CREATE INDEX IF NOT EXISTS club_mail_outbox_confirmation_recent_idx
  ON club_mail_outbox (to_addr, created_at DESC)
  WHERE kind = 'email_confirmation';
