#!/usr/bin/env bash
# Создаёт одноразовый PostgreSQL, применяет тестовую схему и реальные миграции.
# Рабочие .env и существующие базы не используются.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTAINER="alumni-integration-$(date +%s)-$$"
cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

docker run --rm -d --name "$CONTAINER" \
  --tmpfs /var/lib/postgresql/data \
  -e POSTGRES_DB=alumni_staged -e POSTGRES_USER=club \
  -e POSTGRES_PASSWORD=integration-test-only \
  -p 127.0.0.1::5432 postgres:16-alpine >/dev/null
for attempt in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -U club -d alumni_staged >/dev/null 2>&1; then break; fi
  sleep 1
done
PORT="$(docker port "$CONTAINER" 5432/tcp | cut -d: -f2)"
for sql in "$REPO_DIR/apps/api/src/test/integration-schema.sql" \
  "$REPO_DIR/apps/api/migrations/20260908-checkout.sql" \
  "$REPO_DIR/apps/api/migrations/20260908-support.sql"; do
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U club -d alumni_staged < "$sql" >/dev/null
done
cd "$REPO_DIR"
CHECKOUT_DATABASE_URL="postgres://club:integration-test-only@127.0.0.1:$PORT/alumni_staged" \
RUN_CHECKOUT_INTEGRATION=true RUN_SUPPORT_INTEGRATION=true \
  pnpm --filter @club/api exec vitest run src/lib/checkout.integration.test.ts src/routes/support.integration.test.ts
