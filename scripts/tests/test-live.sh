#!/usr/bin/env bash
# Изолированная проверка сборки, PostgreSQL, API и настоящего браузера.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"
PROJECT=club-ci-live
for tool in docker node pnpm curl; do command -v "$tool" >/dev/null || { echo "Не найден $tool" >&2; exit 1; }; done
docker info >/dev/null
if [[ -n "$(docker ps -aq --filter "label=com.docker.compose.project=$PROJECT")" ]] ||
   [[ -n "$(docker volume ls -q --filter "label=com.docker.compose.project=$PROJECT")" ]]; then
  echo "Проект $PROJECT уже существует: разберите предыдущий запуск вручную" >&2
  exit 1
fi
node --input-type=module <<'JS'
import net from 'node:net';
for (const port of [8180, 8181, 8182]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(new Error(`Порт ${port} занят`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
JS
umask 077
LIVE_TEMP="$(mktemp -d /tmp/club-live.XXXXXX)"
LIVE_OWNED=false
compose() { docker compose -p "$PROJECT" --env-file "$LIVE_TEMP/runtime.env" -f docker-compose.yml -f deploy/compose.e2e.yml "$@"; }
cleanup() {
  result=$?
  trap - EXIT
  if [[ "$LIVE_OWNED" == true ]]; then
    compose ps -a || true
    if [[ "$result" != 0 ]]; then
      compose logs --no-color --tail 500 api bootstrap migrate 2>&1 | node --input-type=module -e '
        let input = "";
        for await (const chunk of process.stdin) input += chunk;
        for (const [key, value] of Object.entries(process.env)) {
          if (/PASSWORD|SECRET|TOKEN/.test(key) && value) input = input.split(value).join("[REDACTED]");
        }
        process.stdout.write(input);
      ' || true
    fi
    if ! compose down --volumes --remove-orphans --timeout 30; then result=1; fi
  fi
  node --input-type=module - "$LIVE_TEMP" <<'JS'
import { rmSync } from 'node:fs';
rmSync(process.argv[2], { recursive: true, force: true });
JS
  exit "$result"
}
trap cleanup EXIT
node scripts/tests/prepare-live-env.mjs "$LIVE_TEMP/runtime.env" "$LIVE_TEMP"
# env сгенерирован этим процессом, а не взят из пользовательского файла.
set -a
source "$LIVE_TEMP/runtime.env"
set +a
compose config --quiet
compose build --build-arg "VCS_REF=$(git rev-parse HEAD)"
LIVE_OWNED=true
compose up -d --wait --no-deps postgres mailpit
compose run --rm --no-deps migrate
compose run --rm --no-deps bootstrap
STAFF_ACTION=create STAFF_ROLE=editor STAFF_EMAIL="$TEST_EDITOR_EMAIL" STAFF_PASSWORD="$TEST_EDITOR_PASSWORD" \
  compose run --rm --no-deps -e STAFF_ACTION -e STAFF_ROLE -e STAFF_EMAIL -e STAFF_PASSWORD bootstrap python -m club_ops.cli manage-staff
compose up --no-start --no-deps api
compose up -d --wait --wait-timeout 300 --no-deps api web caddy
wait_ready() {
  for attempt in $(seq 1 60); do
    if curl --fail --silent --max-time 3 "$E2E_BASE_URL/api/ready" >/dev/null; then return 0; fi
    sleep 2
  done
  echo "API не готов за 120 секунд" >&2
  return 1
}
wait_ready
compose run --rm --no-deps api python - < scripts/tests/test-runtime-permissions.py
E2E_LIVE_PHASE=write pnpm --filter @club/web exec playwright test -c playwright.live.config.ts
# Полная копия проверяет утилиты uploads и возврат API на Docker runner.
BACKUP_ENCRYPTION_KEY="$(openssl rand -hex 32)" \
  ENV_FILE="$LIVE_TEMP/runtime.env" DEPLOY_COMPOSE_OVERRIDE="$REPO_DIR/deploy/compose.e2e.yml" \
  COMPOSE_PROJECT_NAME="$PROJECT" STATE_DIR="$LIVE_TEMP/operations" BACKUP_DIR="$LIVE_TEMP/backups" \
  bash scripts/backup.sh
wait_ready
# Настройки оператора и намеренно пустые блоки/фото не должны заполняться повторно.
compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
UPDATE club_settings SET value='{"project_name":"Оператор сохранил настройки"}' WHERE key='site';
UPDATE pages SET title='Главная после редактирования',status='draft' WHERE slug='home';
DELETE FROM pages_blocks WHERE pages_id IN (SELECT id FROM pages WHERE slug='home');
INSERT INTO products(slug,title,images,status) VALUES('hoodie-faculty','Без фото','[]','draft');
SQL
identity_fingerprint() {
  # Хеши паролей и токены проходят только через stdin; в журнал попадает результат сравнения.
  compose exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' <<'SQL' | node --input-type=module -e '
    import { createHash } from "node:crypto";
    let input = "";
    for await (const chunk of process.stdin) input += chunk;
    const identities = JSON.parse(input);
    if (!Array.isArray(identities.users) || identities.users.length < 4) throw new Error("Не найдены учётные записи live-проверки");
    process.stdout.write(createHash("sha256").update(JSON.stringify(identities)).digest("hex"));
  '
SELECT json_build_object(
 'users',(SELECT json_agg(row_to_json(u) ORDER BY u.id) FROM (SELECT id,email,password,token,role,status FROM directus_users) u),
 'settings',(SELECT json_agg(row_to_json(s) ORDER BY s.key) FROM club_settings s),
 'home',(SELECT json_agg(row_to_json(p) ORDER BY p.id) FROM pages p WHERE slug='home'),
 'blocks',(SELECT json_agg(row_to_json(b) ORDER BY b.id) FROM pages_blocks b),
 'product',(SELECT json_agg(row_to_json(p) ORDER BY p.id) FROM products p WHERE slug='hoodie-faculty'));

SQL
}
identities_before="$(identity_fingerprint)"
for attempt in 1 2; do
  compose run --rm --no-deps bootstrap
  compose run --rm --no-deps migrate
  [[ "$(identity_fingerprint)" = "$identities_before" ]] || { echo "Bootstrap изменил пароль, токен, роль или статус учётной записи" >&2; exit 1; }
  echo "Bootstrap $attempt: пароли, токены, роли, настройки и контент сохранены"
done
# Перезапускаются все постоянные сервисы. Тома и состояние браузерных проверок сохраняются.
compose restart postgres api web caddy mailpit
wait_ready
E2E_LIVE_PHASE=read pnpm --filter @club/web exec playwright test -c playwright.live.config.ts
echo "Live E2E: регистрация, письма, профиль, заявка, роли и сохранение после рестарта проверены"
