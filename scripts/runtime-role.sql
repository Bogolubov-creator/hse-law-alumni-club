\getenv runtime_user CHECKOUT_DB_USER
\getenv runtime_password CHECKOUT_DB_PASSWORD
SELECT format('CREATE ROLE %I LOGIN', :'runtime_user') WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname=:'runtime_user') \gexec
SELECT format('ALTER ROLE %I PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', :'runtime_user', :'runtime_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_user') \gexec
-- Только прикладные таблицы. Учетные записи, политики и токены Directus недоступны через SQL API.
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO %I', tablename, :'runtime_user')
  FROM pg_tables WHERE schemaname='public' AND tablename NOT LIKE 'directus_%' AND tablename <> 'club_bootstrap_state' \gexec
SELECT format('REVOKE ALL ON TABLE club_bootstrap_state FROM %I', :'runtime_user')
  WHERE to_regclass('public.club_bootstrap_state') IS NOT NULL \gexec
SELECT format('GRANT USAGE, SELECT ON SEQUENCE %I TO %I', sequencename, :'runtime_user')
  FROM pg_sequences WHERE schemaname='public' AND sequencename LIKE 'club_%' \gexec
