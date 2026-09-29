#!/usr/bin/env bash
# Совместимое старое имя: теперь всегда сохраняется единый снимок БД и uploads.
set -euo pipefail
echo "Используется scripts/backup.sh: БД и файлы копируются вместе." >&2
exec bash "$(dirname "${BASH_SOURCE[0]}")/backup.sh" "$@"
