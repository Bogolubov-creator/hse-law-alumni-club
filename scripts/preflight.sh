#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ops-common.sh"
ops_init
source /etc/os-release
[[ "$ID" = ubuntu && "$VERSION_ID" = 24.04 ]] || { echo 'Проверенная серверная ОС: Ubuntu 24.04 LTS' >&2; exit 1; }
for tool in docker git curl openssl tar gzip python3 flock sha256sum timeout; do
  command -v "$tool" >/dev/null || { echo "Не установлен $tool" >&2; exit 1; }
done
docker info >/dev/null
docker compose version >/dev/null
docker buildx version >/dev/null
ops_assert_native_project
[[ -z "$(git status --porcelain)" ]] || { echo 'Checkout содержит изменения; сначала зафиксируйте проверяемую версию' >&2; exit 1; }
[[ "$(stat -c '%a' "$ENV_FILE")" = 600 ]] || { echo 'Рабочий env должен иметь права 0600' >&2; exit 1; }
[[ "$(stat -c '%u' "$ENV_FILE")" = "$(id -u)" ]] || { echo 'Рабочий env должен принадлежать оператору команды' >&2; exit 1; }
[[ "$(df -Pm "$REPO_DIR" | awk 'NR==2 {print $4}')" -ge "${MIN_FREE_DISK_MB:-5120}" ]] || { echo 'Для сборки нужно не менее 5 GiB свободного места (MIN_FREE_DISK_MB)' >&2; exit 1; }
[[ "$(ops_value BACKUP_ENCRYPTION_KEY)" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'BACKUP_ENCRYPTION_KEY должен содержать 64 hex-символа' >&2; exit 1; }
"${compose[@]}" config --format json | python3 "$REPO_DIR/scripts/preflight-config.py"
if [[ -n "$(ops_value BACKUP_OFFSITE_REMOTE)" ]]; then command -v rclone >/dev/null; fi
echo "Preflight OK: Ubuntu $VERSION_ID; commit $(git rev-parse --short HEAD)"
