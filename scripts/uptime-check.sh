#!/usr/bin/env bash
# Uptime-пинг сайта с алертом в офисный Telegram-чат.
#
# Проверяет /api/health; при переходе OK→FAIL шлёт сообщение в OFFICE_TG_CHAT_ID,
# при восстановлении — «сайт снова доступен». Состояние в файле — без спама
# при каждом прогоне. Запускать с ХОСТА (не из контейнера — упавший api сам
# о себе не сообщит).
#
# Cron (каждые 5 минут):
#   */5 * * * * /path/to/repo/scripts/uptime-check.sh >> /var/log/club-uptime.log 2>&1
set -uo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${UPTIME_URL:-http://localhost/api/health}"
STATE_FILE="${UPTIME_STATE:-/tmp/club-uptime.state}"

# Токен и чат — из окружения или .env
val() { grep "^$1=" "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2-; }
TG_TOKEN="${OFFICE_TG_BOT_TOKEN:-$(val OFFICE_TG_BOT_TOKEN)}"
TG_CHAT="${OFFICE_TG_CHAT_ID:-$(val OFFICE_TG_CHAT_ID)}"

notify() {
  [ -z "$TG_TOKEN" ] || [ -z "$TG_CHAT" ] && { echo "$(date -Iseconds) [uptime] TG не настроен: $1"; return; }
  # URL с токеном передаём через stdin-конфиг curl, а не в argv: иначе токен виден
  # в `ps`/аудит-логах хоста на всё время запроса. printf — builtin, в ps не попадает.
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
