BEGIN;
CREATE TABLE IF NOT EXISTS club_news_inbox (
  id text PRIMARY KEY,
  source_url text NOT NULL UNIQUE,
  sources text[] NOT NULL,
  title text NOT NULL,
  published_at timestamptz,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'imported', 'dismissed')),
  news_id uuid REFERENCES news(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS club_news_source_runs (
  source text PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  found integer NOT NULL DEFAULT 0,
  error text
);
CREATE TABLE IF NOT EXISTS club_social_reactions (
  alumni_id uuid NOT NULL REFERENCES alumni(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  message_id bigint NOT NULL,
  active boolean NOT NULL,
  event_at bigint NOT NULL,
  update_id bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (alumni_id, chat_id, message_id)
);
CREATE TABLE IF NOT EXISTS club_social_membership (
  alumni_id uuid PRIMARY KEY REFERENCES alumni(id) ON DELETE CASCADE,
  telegram_id text NOT NULL,
  subscribed boolean NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
