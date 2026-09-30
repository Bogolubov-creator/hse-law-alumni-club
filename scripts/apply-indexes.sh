#!/usr/bin/env bash
# Совместимая команда ручного применения схемы через общий migrate-сервис.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ops-common.sh"
ops_init
ops_lock
ops_assert_native_project
"${compose[@]}" run --rm --no-deps migrate
