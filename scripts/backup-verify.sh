#!/usr/bin/env bash
# Проверка восстановимости последнего бэкапа (152-ФЗ: не только копия, но и
# доказанная возможность восстановления).
#
# Берёт свежайший club-*.sql.gz.enc, расшифровывает, разворачивает во ВРЕМЕННУЮ
# базу club_verify внутри контейнера postgres, сверяет число строк ключевых
# таблиц с боевой базой, затем удаляет временную базу. Боевая база не трогается.
#
# Cron (еженедельно, понедельник 04:00, после ночного бэкапа):
#   0 4 * * 1 /path/to/repo/scripts/backup-verify.sh >> /var/log/club-backup-verify.log 2>&1
# При провале шлёт алерт в офисный Telegram-чат.
set -euo pipefail
umask 077
ENV_FILE="${ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/club/backups}"
PG="${PG_CONTAINER:-club-pravo-hse-postgres-1}"
VERIFY_DB="club_verify_$(date +%s)_$$"
CREATED=false

val() { grep "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-; }
KEY="${BACKUP_ENCRYPTION_KEY:-$(val BACKUP_ENCRYPTION_KEY)}"
TG_TOKEN="${OFFICE_TG_BOT_TOKEN:-$(val OFFICE_TG_BOT_TOKEN)}"
TG_CHAT="${OFFICE_TG_CHAT_ID:-$(val OFFICE_TG_CHAT_ID)}"
PGUSER="${POSTGRES_USER:-$(val POSTGRES_USER)}"; PGUSER="${PGUSER:-club}"
PGDB="${POSTGRES_DB:-$(val POSTGRES_DB)}"; PGDB="${PGDB:-club}"

fail() {
  echo "$(date -Iseconds) [backup-verify] ОШИБКА: $1" >&2
  if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
    # Токен – через stdin-конфиг curl, не в argv (иначе виден в `ps`). printf – builtin.
    printf 'url = "https://api.telegram.org/bot%s/sendMessage"\n' "$TG_TOKEN" \
      | curl -s -m 10 --config - -d chat_id="$TG_CHAT" --data-urlencode text="🔴 Проверка бэкапа провалилась: $1" >/dev/null || true
  fi
  exit 1
}

[ -n "$KEY" ] || fail "нет BACKUP_ENCRYPTION_KEY в .env"
export BACKUP_ENCRYPTION_KEY="$KEY"

LATEST="$(ls -t "$BACKUP_DIR"/club-*.sql.gz.enc 2>/dev/null | head -1)"
[ -n "$LATEST" ] || fail "в $BACKUP_DIR нет ни одного бэкапа"
echo "$(date -Iseconds) [backup-verify] проверяю: $(basename "$LATEST")"

# 1) Расшифровка + распаковка во временный файл
TMP_SQL="$(mktemp)"
cleanup() {
  rm -f "$TMP_SQL"
  if [ "$CREATED" = true ]; then docker exec "$PG" dropdb -U "$PGUSER" --if-exists "$VERIFY_DB" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in "$LATEST" | gunzip > "$TMP_SQL" 2>/dev/null || fail "не расшифровался/не распаковался (ключ? повреждение?)"
head -20 "$TMP_SQL" | grep -q "PostgreSQL database dump" || fail "содержимое не похоже на дамп PostgreSQL"

# 2) Восстановление во временную базу
docker exec "$PG" createdb -U "$PGUSER" "$VERIFY_DB" || fail "createdb не сработал"
CREATED=true
docker exec -i "$PG" psql -U "$PGUSER" -d "$VERIFY_DB" -q -v ON_ERROR_STOP=1 < "$TMP_SQL" >/dev/null 2>&1 \
  || fail "psql не смог восстановить дамп"

# 3) Сверка ключевых таблиц с боевой базой (бэкап ночной – допускаем дрейф)
for t in alumni events orders points_ledger; do
  live=$(docker exec "$PG" psql -U "$PGUSER" -d "$PGDB" -tAc "select count(*) from $t" 2>/dev/null || echo "-1")
  rest=$(docker exec "$PG" psql -U "$PGUSER" -d "$VERIFY_DB" -tAc "select count(*) from $t" 2>/dev/null || echo "-2")
  [ "$rest" -ge 0 ] 2>/dev/null || fail "таблица $t не восстановилась"
  echo "  $t: боевая=$live, из бэкапа=$rest"
done

docker exec "$PG" dropdb -U "$PGUSER" "$VERIFY_DB"
CREATED=false
echo "$(date -Iseconds) [backup-verify] ✓ бэкап восстановим"
