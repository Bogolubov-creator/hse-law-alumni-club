#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$root"
output=${1:?Нужен новый каталог отчётов}
mkdir "$output"
output=$(cd "$output" && pwd)
uv run --directory frontend --frozen python "$root/scripts/diagnostics/security-inventory.py" --output "$output/source.json"
status=0
for project in backend frontend scripts; do
  for scope in runtime development; do
    set --
    if [[ "$scope" == runtime ]]; then set -- --no-dev; fi
    requirements="$output/$project-$scope.txt"
    if ! uv export --directory "$project" --frozen --no-emit-project --no-emit-local "$@" --format requirements-txt --output-file "$requirements" >/dev/null; then
      status=1
      continue
    fi
    if ! uv run --directory frontend --frozen pip-audit -r "$requirements" --no-deps --disable-pip --format json --output "$output/$project-$scope.json"; then
      status=1
    fi
  done
done
exit "$status"
