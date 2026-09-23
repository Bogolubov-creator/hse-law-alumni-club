#!/usr/bin/env bash
# Зашифрованная копия файлов CMS. Ключ общий с backup-db, хранится отдельно от копий.
set -euo pipefail
umask 077
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$REPO_DIR/.env}"
BACKUP_DIR="${BACKUP_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/club/backups}"
DIRECTUS_CONTAINER="${DIRECTUS_CONTAINER:-club-pravo-hse-directus-1}"
if [[ -z "${BACKUP_ENCRYPTION_KEY:-}" ]]; then
  BACKUP_ENCRYPTION_KEY="$(sed -n 's/^BACKUP_ENCRYPTION_KEY=//p' "$ENV_FILE")"
fi
: "${BACKUP_ENCRYPTION_KEY:?Задайте ключ шифрования}"
export BACKUP_ENCRYPTION_KEY
BACKUP_OFFSITE_REMOTE="${BACKUP_OFFSITE_REMOTE:-$(sed -n 's/^BACKUP_OFFSITE_REMOTE=//p' "$ENV_FILE")}"
mkdir -p "$BACKUP_DIR"
OUT="$BACKUP_DIR/uploads-$(date +%F-%H%M%S)-$$.tar.gz.enc"
PARTIAL="$OUT.partial"
trap 'rm -f "$PARTIAL"' EXIT
docker exec "$DIRECTUS_CONTAINER" tar -C /directus/uploads -czf - . \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -out "$PARTIAL"
# Проверяем читаемость полного архива до объявления копии готовой.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$PARTIAL" | tar -tzf - >/dev/null
mv "$PARTIAL" "$OUT"
if [[ -n "${BACKUP_OFFSITE_REMOTE:-}" ]]; then
  command -v rclone >/dev/null || { echo "Не установлен rclone для offsite-копии" >&2; exit 1; }
  rclone copy "$OUT" "$BACKUP_OFFSITE_REMOTE"
fi
echo "OK: $OUT"
