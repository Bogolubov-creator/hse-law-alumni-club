BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE TABLE IF NOT EXISTS club_polls (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    question varchar(240) NOT NULL,
    options_json jsonb NOT NULL,
    status varchar(12) NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    opened_at timestamptz,
    closed_at timestamptz,
    CONSTRAINT club_poll_status CHECK (status IN ('draft','active','closed'))
);
CREATE INDEX IF NOT EXISTS club_poll_status_created ON club_polls(status,created_at DESC);
CREATE TABLE IF NOT EXISTS club_poll_votes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    poll_id uuid NOT NULL REFERENCES club_polls(id) ON DELETE CASCADE,
    alumni_id uuid NOT NULL REFERENCES alumni(id) ON DELETE CASCADE,
    option_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT club_poll_vote_once UNIQUE(poll_id,alumni_id)
);
CREATE INDEX IF NOT EXISTS club_poll_vote_alumni ON club_poll_votes(alumni_id);
COMMIT;
