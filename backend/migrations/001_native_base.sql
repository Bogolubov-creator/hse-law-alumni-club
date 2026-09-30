-- Нативная основа сохраняет типы, UUID и связи существующей базы Directus 11.
-- Применяется перед миграциями club_*; существующие строки не обновляются и не удаляются.
BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtextextended('club:native-schema:v1', 0));

-- Определения столбцов записаны один раз: они создают новую таблицу и дополняют старую.
CREATE OR REPLACE FUNCTION pg_temp.club_ensure_table(table_name text, definitions text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE definition text;
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS public.%I (%s)', table_name, array_to_string(definitions, ', '));
  FOREACH definition IN ARRAY definitions LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS %s', table_name, definition);
  END LOOP;
END;
$$;

SELECT pg_temp.club_ensure_table('achievements', ARRAY[
  'id uuid NOT NULL',
  'key character varying(255)',
  'title character varying(255)',
  'description text',
  'rule_json json',
  'points_reward integer DEFAULT 0',
  'sort integer',
  'icon character varying(255)',
  'kind character varying(255)'
]);

SELECT pg_temp.club_ensure_table('alumni', ARRAY[
  'id uuid NOT NULL',
  'user_id uuid',
  'fio character varying(255)',
  'cohort character varying(255)',
  'status character varying(255) DEFAULT ''active''::character varying',
  'verification_status character varying(255) DEFAULT ''pending''::character varying',
  'points_cached integer DEFAULT 0',
  'level_cached character varying(255) DEFAULT ''graduate''::character varying',
  'personal_discount integer DEFAULT 0',
  'contacts_json json',
  'edu_program character varying(255)',
  'edu_level character varying(255)',
  'interests_json json',
  'podcast_reminder_sent boolean DEFAULT false',
  'podcast_sub_until timestamp with time zone',
  'avatar character varying(255)',
  'referral_code character varying(255)',
  'telegram_id character varying(255)',
  'token_version integer DEFAULT 0',
  'consent_at timestamp with time zone',
  'consent_version character varying(255)',
  'verified_at timestamp with time zone',
  'referred_by uuid',
  'joined_at timestamp with time zone',
  'last_activity_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('alumni_achievements', ARRAY[
  'id uuid NOT NULL',
  'alumni_id uuid',
  'achievement_id uuid',
  'earned_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('alumni_friends', ARRAY[
  'id uuid NOT NULL',
  'alumni_id uuid',
  'friend_id uuid',
  'status character varying(255) DEFAULT ''pending''::character varying',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('audit_log', ARRAY[
  'id uuid NOT NULL',
  'event character varying(255)',
  'actor character varying(255)',
  'subject character varying(255)',
  'detail json',
  'ip character varying(255)',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('block_cta', ARRAY[
  'id uuid NOT NULL',
  'title character varying(255)',
  'text text',
  'button character varying(255)'
]);

SELECT pg_temp.club_ensure_table('block_hero', ARRAY[
  'id uuid NOT NULL',
  'badge character varying(255)',
  'title_pre character varying(255)',
  'title_accent character varying(255)',
  'subtitle text',
  'cta_primary character varying(255)',
  'cta_secondary character varying(255)',
  'history_eyebrow character varying(255)',
  'history_title character varying(255)',
  'history_hint character varying(255)',
  'marquee json'
]);

SELECT pg_temp.club_ensure_table('carts', ARRAY[
  'id uuid NOT NULL',
  'alumni_id uuid',
  'session_token character varying(255)',
  'items_json json',
  'updated_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('directus_files', ARRAY[
  'id uuid NOT NULL',
  'storage character varying(255) NOT NULL',
  'filename_disk character varying(255)',
  'filename_download character varying(255) NOT NULL',
  'title character varying(255)',
  'type character varying(255)',
  'folder uuid',
  'uploaded_by uuid',
  'created_on timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL',
  'modified_by uuid',
  'modified_on timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL',
  'charset character varying(50)',
  'filesize bigint',
  'width integer',
  'height integer',
  'duration integer',
  'embed character varying(200)',
  'description text',
  'location text',
  'tags text',
  'metadata json',
  'focal_point_x integer',
  'focal_point_y integer',
  'tus_id character varying(64)',
  'tus_data json',
  'uploaded_on timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('directus_roles', ARRAY[
  'id uuid NOT NULL',
  'name character varying(100) NOT NULL',
  'icon character varying(64) DEFAULT ''supervised_user_circle''::character varying NOT NULL',
  'description text',
  'parent uuid'
]);

SELECT pg_temp.club_ensure_table('directus_users', ARRAY[
  'id uuid NOT NULL',
  'first_name character varying(50)',
  'last_name character varying(50)',
  'email character varying(128)',
  'password character varying(255)',
  'location character varying(255)',
  'title character varying(50)',
  'description text',
  'tags json',
  'avatar uuid',
  'language character varying(255) DEFAULT NULL::character varying',
  'tfa_secret character varying(255)',
  'status character varying(16) DEFAULT ''active''::character varying NOT NULL',
  'role uuid',
  'token character varying(255)',
  'last_access timestamp with time zone',
  'last_page character varying(255)',
  'provider character varying(128) DEFAULT ''default''::character varying NOT NULL',
  'external_identifier character varying(255)',
  'auth_data json',
  'email_notifications boolean DEFAULT true',
  'appearance character varying(255)',
  'theme_dark character varying(255)',
  'theme_light character varying(255)',
  'theme_light_overrides json',
  'theme_dark_overrides json',
  'text_direction character varying(255) DEFAULT ''auto''::character varying NOT NULL'
]);

SELECT pg_temp.club_ensure_table('event_rsvps', ARRAY[
  'id uuid NOT NULL',
  'event_id uuid',
  'alumni_id uuid',
  'attended boolean DEFAULT false',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('events', ARRAY[
  'id uuid NOT NULL',
  'title character varying(255)',
  'description text',
  'starts_at timestamp with time zone',
  'location character varying(255)',
  'cover character varying(255)',
  'reg_url character varying(255)',
  'reminder_sent boolean DEFAULT false',
  'format character varying(255) DEFAULT ''offline''::character varying',
  'points integer DEFAULT 60',
  'status character varying(255) DEFAULT ''published''::character varying',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('levels', ARRAY[
  'id uuid NOT NULL',
  'key character varying(255)',
  'title character varying(255)',
  'min_points integer DEFAULT 0',
  'discount_percent integer DEFAULT 0',
  'sort integer',
  'color character varying(255)'
]);

SELECT pg_temp.club_ensure_table('news', ARRAY[
  'id uuid NOT NULL',
  'slug character varying(255)',
  'title character varying(255)',
  'excerpt text',
  'body text',
  'source_url character varying(255)',
  'published_at timestamp with time zone',
  'status character varying(255) DEFAULT ''draft''::character varying'
]);

SELECT pg_temp.club_ensure_table('offers', ARRAY[
  'id uuid NOT NULL',
  'kind character varying(255) DEFAULT ''level''::character varying',
  'alumni_id uuid',
  'level_key character varying(255)',
  'percent integer DEFAULT 0',
  'title character varying(255)',
  'active boolean DEFAULT true',
  'valid_until timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('orders', ARRAY[
  'id uuid NOT NULL',
  'number character varying(255)',
  'alumni_id uuid',
  'type character varying(255) DEFAULT ''dpo''::character varying',
  'items_json json',
  'subtotal integer DEFAULT 0',
  'member_discount integer DEFAULT 0',
  'total_estimate integer DEFAULT 0',
  'contact_fio character varying(255)',
  'contact_phone character varying(255)',
  'contact_email character varying(255)',
  'fulfillment character varying(255) DEFAULT ''pickup''::character varying',
  'address text',
  'comment text',
  'consent_pdn boolean DEFAULT false',
  'payment_id character varying(255)',
  'payment_status character varying(255)',
  'paid_at timestamp with time zone',
  'status character varying(255) DEFAULT ''new''::character varying',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('pages', ARRAY[
  'id uuid NOT NULL',
  'slug character varying(255)',
  'title character varying(255)',
  'status character varying(255) DEFAULT ''draft''::character varying',
  'sort integer'
]);

SELECT pg_temp.club_ensure_table('pages_blocks', ARRAY[
  'id uuid NOT NULL',
  'collection character varying(255)',
  'item character varying(255)',
  'sort integer',
  'pages_id uuid'
]);

SELECT pg_temp.club_ensure_table('podcast_plays', ARRAY[
  'id uuid NOT NULL',
  'podcast_id uuid',
  'alumni_id uuid',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('podcasts', ARRAY[
  'id uuid NOT NULL',
  'title character varying(255)',
  'description text',
  'cover character varying(255)',
  'audio_url character varying(255)',
  'video_url character varying(255)',
  'duration character varying(255)',
  'is_free boolean DEFAULT false',
  'sort integer',
  'status character varying(255) DEFAULT ''draft''::character varying',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('point_rules', ARRAY[
  'id uuid NOT NULL',
  'reason character varying(255)',
  'points integer DEFAULT 0',
  'active boolean DEFAULT true',
  'description character varying(255)'
]);

SELECT pg_temp.club_ensure_table('points_ledger', ARRAY[
  'id uuid NOT NULL',
  'alumni_id uuid',
  'delta integer DEFAULT 0',
  'reason character varying(255)',
  'ref character varying(255)',
  'comment text',
  'idempotency_key character varying(255)',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('products', ARRAY[
  'id uuid NOT NULL',
  'slug character varying(255)',
  'title character varying(255)',
  'category character varying(255)',
  'price integer DEFAULT 0',
  'images json',
  'variants_json json',
  'stock integer DEFAULT 0',
  'description text',
  'status character varying(255) DEFAULT ''draft''::character varying'
]);

SELECT pg_temp.club_ensure_table('programs', ARRAY[
  'id uuid NOT NULL',
  'slug character varying(255)',
  'title character varying(255)',
  'direction character varying(255)',
  'format character varying(255) DEFAULT ''online''::character varying',
  'duration character varying(255)',
  'price integer DEFAULT 0',
  'dates json',
  'capacity integer',
  'seats_taken integer DEFAULT 0',
  'modules json',
  'teachers json',
  'document character varying(255)',
  'source_url character varying(255)',
  'enrollment character varying(255) DEFAULT ''actual''::character varying',
  'description text',
  'cover character varying(255)',
  'hse_id character varying(255)',
  'tagline text',
  'audience json',
  'results json',
  'advantages json',
  'status character varying(255) DEFAULT ''draft''::character varying'
]);

SELECT pg_temp.club_ensure_table('push_subs', ARRAY[
  'id uuid NOT NULL',
  'alumni_id uuid',
  'endpoint text',
  'keys json',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('referrals', ARRAY[
  'id uuid NOT NULL',
  'referrer_id uuid',
  'invited_user_id uuid',
  'code character varying(255)',
  'status character varying(255) DEFAULT ''pending''::character varying',
  'reward_points integer DEFAULT 0',
  'created_at timestamp with time zone'
]);

SELECT pg_temp.club_ensure_table('timeline_items', ARRAY[
  'id uuid NOT NULL',
  'year character varying(255)',
  'title character varying(255)',
  'text text',
  'metric character varying(255)',
  'sort integer',
  'status character varying(255) DEFAULT ''published''::character varying'
]);

-- Имена Directus сохранены только для совместимости пользователей, ролей и файлов.
-- На свежей базе folder остаётся nullable UUID без ссылки на CMS metadata;
-- существующий FK на directus_folders не удаляется.
SELECT pg_temp.club_ensure_table('club_settings', ARRAY[
  'key text NOT NULL',
  'value jsonb NOT NULL',
  'updated_at timestamp with time zone NOT NULL DEFAULT now()'
]);

CREATE OR REPLACE FUNCTION pg_temp.club_ensure_constraint(table_name text, constraint_name text, definition text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = format('public.%I', table_name)::regclass
      AND (conname = constraint_name OR (definition LIKE 'PRIMARY KEY%' AND contype = 'p'))
  ) THEN
    EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', table_name, constraint_name, definition);
  END IF;
END;
$$;

SELECT pg_temp.club_ensure_constraint('achievements', 'achievements_key_unique', 'UNIQUE (key)');
SELECT pg_temp.club_ensure_constraint('achievements', 'achievements_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('alumni_achievements', 'alumni_achievements_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('alumni_friends', 'alumni_friends_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('alumni', 'alumni_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('alumni', 'alumni_referral_code_unique', 'UNIQUE (referral_code)');
SELECT pg_temp.club_ensure_constraint('alumni', 'alumni_telegram_id_unique', 'UNIQUE (telegram_id)');
SELECT pg_temp.club_ensure_constraint('audit_log', 'audit_log_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('block_cta', 'block_cta_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('block_hero', 'block_hero_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('carts', 'carts_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('directus_files', 'directus_files_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('directus_roles', 'directus_roles_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('directus_users', 'directus_users_email_unique', 'UNIQUE (email)');
SELECT pg_temp.club_ensure_constraint('directus_users', 'directus_users_external_identifier_unique', 'UNIQUE (external_identifier)');
SELECT pg_temp.club_ensure_constraint('directus_users', 'directus_users_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('directus_users', 'directus_users_token_unique', 'UNIQUE (token)');
SELECT pg_temp.club_ensure_constraint('event_rsvps', 'event_rsvps_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('events', 'events_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('levels', 'levels_key_unique', 'UNIQUE (key)');
SELECT pg_temp.club_ensure_constraint('levels', 'levels_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('news', 'news_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('news', 'news_slug_unique', 'UNIQUE (slug)');
SELECT pg_temp.club_ensure_constraint('offers', 'offers_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('orders', 'orders_number_unique', 'UNIQUE (number)');
SELECT pg_temp.club_ensure_constraint('orders', 'orders_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('pages_blocks', 'pages_blocks_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('pages', 'pages_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('pages', 'pages_slug_unique', 'UNIQUE (slug)');
SELECT pg_temp.club_ensure_constraint('podcast_plays', 'podcast_plays_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('podcasts', 'podcasts_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('point_rules', 'point_rules_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('point_rules', 'point_rules_reason_unique', 'UNIQUE (reason)');
SELECT pg_temp.club_ensure_constraint('points_ledger', 'points_ledger_idempotency_key_unique', 'UNIQUE (idempotency_key)');
SELECT pg_temp.club_ensure_constraint('points_ledger', 'points_ledger_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('products', 'products_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('products', 'products_slug_unique', 'UNIQUE (slug)');
SELECT pg_temp.club_ensure_constraint('programs', 'programs_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('programs', 'programs_slug_unique', 'UNIQUE (slug)');
SELECT pg_temp.club_ensure_constraint('push_subs', 'push_subs_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('referrals', 'referrals_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('timeline_items', 'timeline_items_pkey', 'PRIMARY KEY (id)');
SELECT pg_temp.club_ensure_constraint('alumni_achievements', 'alumni_achievements_achievement_id_foreign', 'FOREIGN KEY (achievement_id) REFERENCES public.achievements(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('alumni_achievements', 'alumni_achievements_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('alumni_friends', 'alumni_friends_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('alumni_friends', 'alumni_friends_friend_id_foreign', 'FOREIGN KEY (friend_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('alumni', 'alumni_referred_by_foreign', 'FOREIGN KEY (referred_by) REFERENCES public.alumni(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('alumni', 'alumni_user_id_foreign', 'FOREIGN KEY (user_id) REFERENCES public.directus_users(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('carts', 'carts_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('directus_files', 'directus_files_modified_by_foreign', 'FOREIGN KEY (modified_by) REFERENCES public.directus_users(id)');
SELECT pg_temp.club_ensure_constraint('directus_files', 'directus_files_uploaded_by_foreign', 'FOREIGN KEY (uploaded_by) REFERENCES public.directus_users(id)');
SELECT pg_temp.club_ensure_constraint('directus_roles', 'directus_roles_parent_foreign', 'FOREIGN KEY (parent) REFERENCES public.directus_roles(id)');
SELECT pg_temp.club_ensure_constraint('directus_users', 'directus_users_role_foreign', 'FOREIGN KEY (role) REFERENCES public.directus_roles(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('event_rsvps', 'event_rsvps_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('event_rsvps', 'event_rsvps_event_id_foreign', 'FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('offers', 'offers_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('orders', 'orders_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('pages_blocks', 'pages_blocks_pages_id_foreign', 'FOREIGN KEY (pages_id) REFERENCES public.pages(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('podcast_plays', 'podcast_plays_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('podcast_plays', 'podcast_plays_podcast_id_foreign', 'FOREIGN KEY (podcast_id) REFERENCES public.podcasts(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('points_ledger', 'points_ledger_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('push_subs', 'push_subs_alumni_id_foreign', 'FOREIGN KEY (alumni_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('referrals', 'referrals_invited_user_id_foreign', 'FOREIGN KEY (invited_user_id) REFERENCES public.directus_users(id) ON DELETE SET NULL');
SELECT pg_temp.club_ensure_constraint('referrals', 'referrals_referrer_id_foreign', 'FOREIGN KEY (referrer_id) REFERENCES public.alumni(id) ON DELETE CASCADE');
SELECT pg_temp.club_ensure_constraint('club_settings', 'club_settings_pkey', 'PRIMARY KEY (key)');

-- Ранее UUID и date-created заполнял Directus. Defaults действуют только на будущие INSERT.
-- Явно настроенный оператором default не заменяется.
CREATE OR REPLACE FUNCTION pg_temp.club_ensure_default(table_name text, column_name text, expression text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attrdef d JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE d.adrelid = format('public.%I', table_name)::regclass AND a.attname = column_name
  ) THEN
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT %s', table_name, column_name, expression);
  END IF;
END;
$$;

SELECT pg_temp.club_ensure_default('achievements', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('alumni', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('alumni_achievements', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('alumni_friends', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('audit_log', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('block_cta', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('block_hero', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('carts', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('directus_files', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('directus_roles', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('directus_users', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('event_rsvps', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('events', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('levels', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('news', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('offers', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('orders', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('pages', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('pages_blocks', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('podcast_plays', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('podcasts', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('point_rules', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('points_ledger', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('products', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('programs', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('push_subs', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('referrals', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('timeline_items', 'id', 'gen_random_uuid()');
SELECT pg_temp.club_ensure_default('alumni', 'joined_at', 'now()');
SELECT pg_temp.club_ensure_default('alumni_achievements', 'earned_at', 'now()');
SELECT pg_temp.club_ensure_default('alumni_friends', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('audit_log', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('carts', 'updated_at', 'now()');
SELECT pg_temp.club_ensure_default('event_rsvps', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('events', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('orders', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('podcast_plays', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('podcasts', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('points_ledger', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('push_subs', 'created_at', 'now()');
SELECT pg_temp.club_ensure_default('referrals', 'created_at', 'now()');

-- Расширение не обрезает существующие тексты, в отличие от обратного varchar(255).
ALTER TABLE public.programs ALTER COLUMN tagline TYPE text;

-- Один аккаунт связан с одним профилем. Не выбираем и не удаляем legacy-дубликат автоматически.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.alumni WHERE user_id IS NOT NULL
    GROUP BY user_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'alumni.user_id содержит дубликаты: требуется ручное сопоставление профилей до миграции';
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_alumni_user_id
  ON public.alumni(user_id) WHERE user_id IS NOT NULL;

-- Полный снимок legacy-настроек приватный: здесь могут быть ключи интеграций.
-- Повторная миграция не заменяет ни снимок, ни собственные настройки приложения.
DO $$
BEGIN
  IF to_regclass('public.directus_settings') IS NOT NULL THEN
    INSERT INTO public.club_settings (key, value)
      SELECT 'legacy_directus:' || s.id::text, to_jsonb(s) FROM public.directus_settings s
      ON CONFLICT (key) DO NOTHING;
  END IF;
END;
$$;

COMMIT;
