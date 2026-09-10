#!/usr/bin/env bash
# После vite build: SPA fallback для GitHub Pages + отключение Jekyll.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$ROOT/dist"
if [[ ! -f "$DIST/index.html" ]]; then
  echo "prepare-pages: нет $DIST/index.html – сначала vite build" >&2
  exit 1
fi
cp "$DIST/index.html" "$DIST/404.html"
: > "$DIST/.nojekyll"
echo "prepare-pages: 404.html + .nojekyll готовы"
