-- Индексы под масштаб (тысячи пользователей, десятки подкастов).
-- Postgres НЕ индексирует FK-колонки автоматически — добавляем вручную.
-- Идемпотентно (IF NOT EXISTS). Применять на каждом деплое:
--   docker exec -i <postgres> psql -U <user> -d <db> < infra/indexes.sql
-- ON_ERROR_STOP не включаем: если одна колонка отличается/строка-дубль мешает
-- уникальному индексу — остальные всё равно применятся.

-- Баллы: агрегат по выпускнику + идемпотентность начислений
CREATE INDEX IF NOT EXISTS idx_points_ledger_alumni ON points_ledger (alumni_id);
-- Уникальность гасит гонку двойного начисления (addPoints) на уровне БД: второй
-- конкурентный insert с тем же idempotency_key отклоняется. NULL-ключи (обычные
-- начисления без идемпотентности) не конфликтуют — Postgres считает NULL различными.
-- Не-уникальный индех оставляем как fallback: если в существующей БД уже есть дубли
-- ключей, уникальный не создастся (ON_ERROR_STOP выключен), но lookup останется быстрым.
CREATE INDEX IF NOT EXISTS idx_points_ledger_idem ON points_ledger (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_ledger_idem ON points_ledger (idempotency_key);

-- RSVP: счётчики «пойдут» и «мой RSVP»; уникальность гасит гонку двойного клика
CREATE INDEX IF NOT EXISTS idx_event_rsvps_event ON event_rsvps (event_id);
CREATE INDEX IF NOT EXISTS idx_event_rsvps_alumni ON event_rsvps (alumni_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_event_rsvps_event_alumni ON event_rsvps (event_id, alumni_id);

-- Заявки: выборки по выпускнику/статусу, номер, сортировка по дате
CREATE INDEX IF NOT EXISTS idx_orders_alumni ON orders (alumni_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders (number);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);

-- Корзина: поиск по сессии на каждой операции
CREATE INDEX IF NOT EXISTS idx_carts_session ON carts (session_token);

-- Web-push: подписки выпускника + дедуп по endpoint
CREATE INDEX IF NOT EXISTS idx_push_subs_alumni ON push_subs (alumni_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_endpoint ON push_subs (endpoint);

-- Выпускники: связка аккаунта, реф-код, привязка Telegram, статус/выпуск, поиск
CREATE INDEX IF NOT EXISTS idx_alumni_user ON alumni (user_id);
CREATE INDEX IF NOT EXISTS idx_alumni_refcode ON alumni (referral_code);
CREATE INDEX IF NOT EXISTS idx_alumni_tg ON alumni (telegram_id);
CREATE INDEX IF NOT EXISTS idx_alumni_verif ON alumni (verification_status);
CREATE INDEX IF NOT EXISTS idx_alumni_cohort ON alumni (cohort);

-- Друзья: связи в обе стороны + статус
CREATE INDEX IF NOT EXISTS idx_friends_alumni ON alumni_friends (alumni_id);
CREATE INDEX IF NOT EXISTS idx_friends_friend ON alumni_friends (friend_id);

-- Каталог: выборки по slug
CREATE INDEX IF NOT EXISTS idx_news_slug ON news (slug);
CREATE INDEX IF NOT EXISTS idx_programs_slug ON programs (slug);
CREATE INDEX IF NOT EXISTS idx_products_slug ON products (slug);

-- Аудит: ретенция и выборки по времени
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at);
