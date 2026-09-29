#!/usr/bin/env bash
# Применяет SQL-миграции и infra/indexes.sql к БД (идемпотентно). После
# bootstrap (когда коллекции/колонки уже созданы). Postgres не индексирует
# FK-колонки сам – эти индексы обязательны под масштаб (тысячи пользователей).
#
#   ./scripts/apply-indexes.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
PG="${PG_CONTAINER:-club-pravo-hse-postgres-1}"
if [[ ! -f "$ENV_FILE" ]] && { [[ -z "${POSTGRES_USER:-}" ]] || [[ -z "${POSTGRES_DB:-}" ]]; }; then
  echo "Нужен ENV_FILE или переменные POSTGRES_USER и POSTGRES_DB" >&2
  exit 2
fi
val() { [[ -f "$ENV_FILE" ]] && sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1 || true; }
PGUSER="${POSTGRES_USER:-$(val POSTGRES_USER)}"; PGUSER="${PGUSER:-club}"
PGDB="${POSTGRES_DB:-$(val POSTGRES_DB)}"; PGDB="${PGDB:-club}"

for migration in "$REPO_DIR"/apps/api/migrations/*.sql; do
  echo "Применяю $(basename "$migration") к $PG ($PGDB)…"
  docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$migration"
done
echo "Применяю infra/indexes.sql к $PG ($PGDB)…"
docker exec -i "$PG" psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d "$PGDB" < "$REPO_DIR/infra/indexes.sql"
echo "Готово. Индексов idx_/uq_:"
docker exec "$PG" psql -U "$PGUSER" -d "$PGDB" -tAc "select count(*) from pg_indexes where indexname like 'idx_%' or indexname like 'uq_%'"
