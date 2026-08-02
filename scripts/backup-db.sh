#!/usr/bin/env bash
# Шифрованный бэкап PostgreSQL (152-ФЗ: резервное копирование + шифрование при хранении).
#
# Дамп берётся из контейнера postgres, сжимается и шифруется AES-256-CBC
# (PBKDF2, 200k итераций) ключом BACKUP_ENCRYPTION_KEY из .env.
#
# Запуск вручную:  ./scripts/backup-db.sh
# Cron (ежесуточно, 03:30):  30 3 * * * /path/to/repo/scripts/backup-db.sh
#
# Восстановление:
#   openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
#     -in club-YYYY-MM-DD.sql.gz.enc | gunzip | docker compose exec -T postgres psql -U club -d club
#
# ВАЖНО: ключ храните отдельно от бэкапов (менеджер секретов/сейф). Бэкапы
# складывайте вне сервера (rclone/scp на отдельное хранилище в РФ).
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_DIR/backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"

# Ключ из окружения или .env
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  BACKUP_ENCRYPTION_KEY="$(grep '^BACKUP_ENCRYPTION_KEY=' "$REPO_DIR/.env" | cut -d= -f2- || true)"
fi
if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  echo "ОШИБКА: задайте BACKUP_ENCRYPTION_KEY в .env (например: openssl rand -hex 32)" >&2
  exit 1
fi
export BACKUP_ENCRYPTION_KEY

# Имя БД/пользователя – из .env (как в backup-verify.sh/apply-indexes.sh), а не
# хардкодом: иначе при смене POSTGRES_USER/DB бэкап тихо ломается на несуществующей БД.
val() { grep "^$1=" "$REPO_DIR/.env" 2>/dev/null | cut -d= -f2-; }
PGUSER="${POSTGRES_USER:-$(val POSTGRES_USER)}"; PGUSER="${PGUSER:-club}"
PGDB="${POSTGRES_DB:-$(val POSTGRES_DB)}"; PGDB="${PGDB:-club}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%F-%H%M)"
OUT="$BACKUP_DIR/club-$STAMP.sql.gz.enc"

docker compose -f "$REPO_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "$PGUSER" -d "$PGDB" --no-owner \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -out "$OUT"

chmod 600 "$OUT"
echo "OK: $OUT ($(du -h "$OUT" | cut -f1))"

# Offsite-копия (152-ФЗ: резервное хранилище отдельно от сервера БД, в РФ). Если
# задан rclone-remote в BACKUP_OFFSITE_REMOTE (напр. "ydisk:club-backups") – копируем
# туда шифрованный дамп. Без переменной шаг молча пропускается (локальный стенд).
if [ -n "${BACKUP_OFFSITE_REMOTE:-}" ]; then
  if command -v rclone >/dev/null 2>&1; then
    rclone copy "$OUT" "$BACKUP_OFFSITE_REMOTE" && echo "OFFSITE OK: $BACKUP_OFFSITE_REMOTE"
  else
    echo "ВНИМАНИЕ: BACKUP_OFFSITE_REMOTE задан, но rclone не установлен – offsite-копия НЕ сделана" >&2
  fi
fi

# Ротация: чистим старше KEEP_DAYS
find "$BACKUP_DIR" -name 'club-*.sql.gz.enc' -mtime +"$KEEP_DAYS" -delete
