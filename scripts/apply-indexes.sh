#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/ops-common.sh"
ops_init
ops_lock
ops_assert_native_project
"${compose[@]}" run --rm --no-deps migrate
