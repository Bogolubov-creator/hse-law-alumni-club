BEGIN;
-- Добавочная служебная таблица. ПДн и токены корзины здесь не сохраняются.
CREATE TABLE IF NOT EXISTS club_checkout_commits (
  key_hash text PRIMARY KEY,
  request_hash text NOT NULL,
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  reservations jsonb NOT NULL DEFAULT '[]',
  released boolean NOT NULL DEFAULT false,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
