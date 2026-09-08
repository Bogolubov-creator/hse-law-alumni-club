-- Обращения отделены от публичных коллекций CMS. Ключ доступа хранится только как хеш.
CREATE TABLE IF NOT EXISTS club_support_tickets (
 id uuid PRIMARY KEY,
 key_hash text NOT NULL,
 request_hash text NOT NULL,
 topic text NOT NULL,
 messages jsonb NOT NULL DEFAULT '[]'::jsonb,
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
 consent_version text NOT NULL,
 consent_text text NOT NULL,
 consent_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS club_support_expiry ON club_support_tickets(expires_at);
