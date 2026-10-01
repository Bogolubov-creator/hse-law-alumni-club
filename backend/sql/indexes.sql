
CREATE INDEX IF NOT EXISTS idx_points_ledger_alumni ON points_ledger (alumni_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_idem ON points_ledger (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_ledger_idem ON points_ledger (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_alumni ON event_rsvps (alumni_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_rsvps_event_alumni ON event_rsvps (event_id, alumni_id);

CREATE INDEX IF NOT EXISTS idx_orders_alumni ON orders (alumni_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders (number);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);

CREATE INDEX IF NOT EXISTS idx_carts_session ON carts (session_token);

CREATE INDEX IF NOT EXISTS idx_push_subs_alumni ON push_subs (alumni_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subs (endpoint);

CREATE INDEX IF NOT EXISTS idx_alumni_user ON alumni (user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_refcode ON alumni (referral_code);
CREATE INDEX IF NOT EXISTS idx_alumni_tg ON alumni (telegram_id);
CREATE INDEX IF NOT EXISTS idx_alumni_verif ON alumni (verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_cohort ON alumni (cohort);

CREATE INDEX IF NOT EXISTS idx_friends_alumni ON alumni_friends (alumni_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON alumni_friends (friend_id);

CREATE INDEX IF NOT EXISTS idx_news_slug ON news (slug);
CREATE INDEX IF NOT EXISTS idx_programs_slug ON programs (slug);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
