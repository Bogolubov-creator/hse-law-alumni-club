#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" = --help ]]; then
  echo 'Ubuntu 24.04: sudo ./scripts/install.sh [--local] [--config-dir /etc/club]'
  echo 'Без --local установщик спросит контур, домены и почтовые настройки.'
  exit 0
fi
[[ "$(id -u)" = 0 ]] || { echo 'Запустите через sudo' >&2; exit 1; }
source /etc/os-release
[[ "$ID" = ubuntu && "$VERSION_ID" = 24.04 ]] || { echo 'Поддерживается Ubuntu 24.04 LTS' >&2; exit 1; }
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo"
[[ -z "$(git status --porcelain)" ]] || { echo 'Checkout содержит изменения; установите чистую проверенную версию' >&2; exit 1; }
if ! command -v python3 >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends python3
fi
exec 8>/run/lock/club-install.lock
flock -n 8 || { echo 'Другая установка уже выполняется' >&2; exit 1; }
exec python3 "$repo/scripts/lib/install-config.py" "$@"
