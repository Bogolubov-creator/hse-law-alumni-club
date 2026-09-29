#!/bin/sh
# Запускается контейнером migrate после bootstrap. Пароли не выводятся и не передаются в argv.
set -eu
: "${CHECKOUT_DB_PASSWORD:?Задайте CHECKOUT_DB_PASSWORD вне репозитория}"
[ "$CHECKOUT_DB_USER" != "$PGUSER" ] || { echo "SQL-роль API должна отличаться от владельца БД" >&2; exit 1; }
for migration in /migrations/*.sql; do
  echo "Миграция: $(basename "$migration")"
  psql -X -v ON_ERROR_STOP=1 -f "$migration"
done
psql -X -v ON_ERROR_STOP=1 -f /indexes.sql
psql -X -v ON_ERROR_STOP=1 -f /runtime-role.sql
