BEGIN;
-- Закрытая таблица API: одноразовые ссылки не доступны через CMS.
CREATE TABLE IF NOT EXISTS club_telegram_links (
  alumni_id uuid PRIMARY KEY REFERENCES alumni(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS club_telegram_links_expiry_idx ON club_telegram_links (expires_at);
COMMIT;
