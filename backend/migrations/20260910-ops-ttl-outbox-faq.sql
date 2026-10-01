BEGIN;

CREATE TABLE IF NOT EXISTS club_faq_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('gap', 'none')),
  gap_id text,
  channel text NOT NULL CHECK (channel IN ('site', 'telegram')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS club_faq_events_created_idx ON club_faq_events (created_at DESC);
CREATE INDEX IF NOT EXISTS club_faq_events_gap_idx ON club_faq_events (kind, gap_id);

CREATE TABLE IF NOT EXISTS club_mail_outbox (
  id bigserial PRIMARY KEY,
  kind text NOT NULL DEFAULT 'office',
  to_addr text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS club_mail_outbox_due_idx
  ON club_mail_outbox (status, next_attempt_at)
  WHERE status = 'pending';

COMMIT;
