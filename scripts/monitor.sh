#!/usr/bin/env bash
# Локальная диагностика. Ненулевой выход виден systemd; внешняя доставка не подразумевается.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ops-common.sh"
ops_init
export MONITOR_URL="$(ops_value PUBLIC_URL)"
export MONITOR_JOBS="$(ops_value JOBS_ENABLED true)"
export MONITOR_DPO="$(ops_value DPO_SYNC_ENABLED true)"
export MONITOR_NEWS="$(ops_value NEWS_SYNC_ENABLED false)"
export STATE_DIR
ids="$("${compose[@]}" ps -aq postgres api web caddy)"
[[ -n "$ids" ]] || { echo 'Контейнеры проекта не найдены' >&2; exit 1; }
python3 "$REPO_DIR/scripts/monitor.py" $ids
