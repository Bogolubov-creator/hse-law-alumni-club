#!/usr/bin/env bash
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="alumni-fastapi-test-$(date +%s)-$$"
cleanup() {
  if ! docker rm -f "$CONTAINER" >/dev/null 2>&1; then
    echo "Не удалось удалить временный контейнер $CONTAINER" >&2
    return 1
  fi
}
docker run --rm -d --name "$CONTAINER" --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=fastapi_migration_test -e POSTGRES_USER=club \
  -e POSTGRES_PASSWORD=integration-test-only -p 127.0.0.1::5432 \
  postgres:16.15-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea >/dev/null
trap cleanup EXIT
READY=false
for attempt in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U club -d fastapi_migration_test >/dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 1
done
if [[ "$READY" != true ]]; then
  echo "Временный PostgreSQL не запустился за 30 секунд" >&2
  exit 1
fi
for sql in "$REPO_DIR"/backend/migrations/*.sql; do
  docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U club -d fastapi_migration_test < "$sql" >/dev/null
done
docker exec -i -e PGOPTIONS='-c client_min_messages=warning' "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U club -d fastapi_migration_test < "$REPO_DIR/backend/sql/indexes.sql" >/dev/null
docker exec -i -e CHECKOUT_DB_USER=club_api -e CHECKOUT_DB_PASSWORD=restricted-test-only "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U club -d fastapi_migration_test < "$REPO_DIR/backend/sql/runtime-role.sql" >/dev/null
PORT="$(docker port "$CONTAINER" 5432/tcp | cut -d: -f2)"
CLUB_TEST_DATABASE_URL="postgres://club:integration-test-only@127.0.0.1:$PORT/fastapi_migration_test" \
  uv run --directory "$REPO_DIR/backend" --frozen pytest -q tests/python "$@"
