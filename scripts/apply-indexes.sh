#!/usr/bin/env bash
# Применяет infra/indexes.sql к БД (идемпотентно). Запускать на деплое ПОСЛЕ
# bootstrap (когда коллекции/колонки уже созданы). Postgres не индексирует
# FK-колонки сам – эти индексы обязательны под масштаб (тысячи пользователей).
#
#   ./scripts/apply-indexes.sh
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG="${PG_CONTAINER:-club-pravo-hse-postgres-1}"
val() { grep "^$1=" "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2-; }
PGUSER="${POSTGRES_USER:-$(val POSTGRES_USER)}"; PGUSER="${PGUSER:-club}"
PGDB="${POSTGRES_DB:-$(val POSTGRES_DB)}"; PGDB="${PGDB:-club}"

echo "Применяю infra/indexes.sql к $PG ($PGDB)…"
docker exec -i "$PG" psql -U "$PGUSER" -d "$PGDB" < "$REPO_DIR/infra/indexes.sql"
echo "Готово. Индексов idx_/uq_:"
docker exec "$PG" psql -U "$PGUSER" -d "$PGDB" -tAc "select count(*) from pg_indexes where indexname like 'idx_%' or indexname like 'uq_%'"
