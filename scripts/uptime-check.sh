#!/usr/bin/env bash
# Uptime-пинг сайта с алертом в офисный Telegram-чат.
#
# Проверяет /api/health; при переходе OK→FAIL шлёт сообщение в OFFICE_TG_CHAT_ID,
# при восстановлении – «сайт снова доступен». Состояние в файле – без спама
# при каждом прогоне. Запускать с ХОСТА (не из контейнера – упавший api сам
# о себе не сообщит).
#
# Cron (каждые 5 минут): см. infra/cron.example.
set -uo pipefail
umask 077

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPLICIT_ENV_FILE="${ENV_FILE:-}"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
if [[ -n "$EXPLICIT_ENV_FILE" && ! -r "$ENV_FILE" ]]; then
  echo "Не удалось прочитать ENV_FILE: $ENV_FILE" >&2
  exit 1
fi
URL="${UPTIME_URL:-http://localhost/api/health}"
STATE_FILE="${UPTIME_STATE:-${XDG_STATE_HOME:-$HOME/.local/state}/club/uptime.state}"
mkdir -p "$(dirname "$STATE_FILE")" || { echo "Не удалось создать каталог состояния" >&2; exit 1; }

# Токен и чат – из окружения или внешнего env.
val() { grep "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-; }
TG_TOKEN="${OFFICE_TG_BOT_TOKEN:-$(val OFFICE_TG_BOT_TOKEN)}"
TG_CHAT="${OFFICE_TG_CHAT_ID:-$(val OFFICE_TG_CHAT_ID)}"

notify() {
  [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ] && { echo "$(date -Iseconds) [uptime] TG не настроен: $1"; return; }
  # URL с токеном передаём через stdin-конфиг curl, а не в argv: иначе токен виден
  # в `ps`/аудит-логах хоста на всё время запроса. printf – builtin, в ps не попадает.
  printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TG_TOKEN" \
    | curl -s -m 10 --config - -d chat_id="$TG_CHAT" --data-urlencode text="$1" >/dev/null || true
}

prev="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"

if curl -fsS -m 10 "$URL" >/dev/null 2>&1; then
  if [ "$prev" != "ok" ]; then
    notify "✅ Сайт клуба снова доступен ($URL)"
    echo "$(date -Iseconds) [uptime] восстановлен"
  fi
  echo ok > "$STATE_FILE"
else
  if [ "$prev" = "ok" ]; then
    notify "🔴 Сайт клуба недоступен! Проверка $URL не отвечает. Зайдите на сервер: docker compose ps && docker compose logs api --tail 50"
    echo "$(date -Iseconds) [uptime] ПАДЕНИЕ"
  fi
  echo fail > "$STATE_FILE"
fi
