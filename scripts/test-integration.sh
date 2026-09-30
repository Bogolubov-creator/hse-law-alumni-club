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
  -p 127.0.0.1::5432 postgres:16.15-alpine@sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea >/dev/null
# Временный сервер initdb принимает Unix socket, затем останавливается.
# TCP становится доступен только у окончательно запущенного PostgreSQL.
READY=false
for attempt in $(seq 1 30); do
  if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U club -d alumni_staged >/dev/null 2>&1; then READY=true; break; fi
  sleep 1
done
if [[ "$READY" != true ]]; then
  echo "Одноразовый PostgreSQL не готов по TCP за 30 секунд" >&2
  exit 1
fi
PORT="$(docker port "$CONTAINER" 5432/tcp | cut -d: -f2)"
for sql in "$REPO_DIR"/backend/migrations/*.sql; do
  docker exec -i "$CONTAINER" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -U club -d alumni_staged < "$sql" >/dev/null
done
cd "$REPO_DIR"
CHECKOUT_DATABASE_URL="postgres://club:integration-test-only@127.0.0.1:$PORT/alumni_staged" \
RUN_NATIVE_AUTH_INTEGRATION=true RUN_DATA_INTEGRATION=true RUN_CHECKOUT_INTEGRATION=true RUN_SUPPORT_INTEGRATION=true RUN_TELEGRAM_INTEGRATION=true \
  pnpm --filter @club/api exec vitest run src/lib/data.integration.test.ts src/lib/native-auth.integration.test.ts src/lib/checkout.integration.test.ts src/lib/payment-store.integration.test.ts src/routes/support.integration.test.ts src/lib/tg-link.integration.test.ts src/lib/news-social.integration.test.ts
# Bootstrap создаёт отдельные временные БД для fresh/repeat/rollback.
docker exec "$CONTAINER" createdb -h 127.0.0.1 -U club club_native_test
NATIVE_BOOTSTRAP_TEST_DATABASE_URL="postgres://club:integration-test-only@127.0.0.1:$PORT/club_native_test" \
  pnpm --filter @club/scripts test
