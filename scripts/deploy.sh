#!/usr/bin/env bash
# Последовательный деплой с внешним env. Без автоматического отката данных.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${ENV_FILE:?Укажите абсолютный путь к рабочему env вне репозитория}"
[[ "$ENV_FILE" = /* && -f "$ENV_FILE" ]] || { echo "ENV_FILE должен быть существующим абсолютным путём" >&2; exit 1; }
case "$ENV_FILE" in "$REPO_DIR"/*) echo "Храните секреты вне репозитория" >&2; exit 1;; esac
cd "$REPO_DIR"
compose=(docker compose --env-file "$ENV_FILE" -f "$REPO_DIR/docker-compose.yml")
# Внешний override нужен, в частности, для репетиции с отдельными портами и томами.
if [[ -n "${DEPLOY_COMPOSE_OVERRIDE:-}" ]]; then compose+=(-f "$DEPLOY_COMPOSE_OVERRIDE"); fi
# Собираем и проверяем конфигурацию до изменения работающих контейнеров.
"${compose[@]}" build
"${compose[@]}" run --rm --no-deps api node --input-type=module -e '
  const { env, assertProdConfig } = await import("./dist/env.js");
  const errors = assertProdConfig();
  if (env.APP_ENV !== "production") errors.push("Деплой требует APP_ENV=production");
  if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
'
PG="$("${compose[@]}" ps -q postgres)"
if [[ -n "$PG" ]]; then
  ENV_FILE="$ENV_FILE" PG_CONTAINER="$PG" bash scripts/backup-db.sh
  ENV_FILE="$ENV_FILE" PG_CONTAINER="$PG" bash scripts/backup-verify.sh
  DIRECTUS="$("${compose[@]}" ps -q directus)"
  [[ -n "$DIRECTUS" ]] || { echo "CMS не запущена: резервная копия файлов невозможна" >&2; exit 1; }
  ENV_FILE="$ENV_FILE" DIRECTUS_CONTAINER="$DIRECTUS" bash scripts/backup-uploads.sh
fi
"${compose[@]}" up -d postgres directus
"${compose[@]}" up -d --force-recreate bootstrap migrate
"${compose[@]}" up -d api web caddy
"${compose[@]}" exec -T caddy caddy reload --config /etc/caddy/Caddyfile
for attempt in $(seq 1 60); do
  if "${compose[@]}" exec -T api node -e 'fetch("http://127.0.0.1:3000/ready").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'; then
    echo "API готов. Проверьте публичный HTTPS и пользовательский smoke по deploy-runbook.md."
    exit 0
  fi
  sleep 2
done
echo "Readiness не прошёл. Проверьте состояние контейнеров и журнал; публичный релиз не подтверждён." >&2
exit 1
