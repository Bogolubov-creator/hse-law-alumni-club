#!/usr/bin/env bash
# Перезапуск локального API со свежим dist (нужен после tsc, иначе старые маршруты – 404).
# Env: /Users/macbook/alumni-staged-evidence/local.env (не в git).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${LOCAL_ENV_FILE:-/Users/macbook/alumni-staged-evidence/local.env}"
PORT="${PORT:-3200}"
POLYFILL='data:text/javascript,import%20os%20from%20%22os%22%3B%20os.networkInterfaces%20%3D%20()%20%3D%3E%20(%7B%20lo0%3A%20%5B%7B%20address%3A%20%22127.0.0.1%22%2C%20netmask%3A%20%22255.0.0.0%22%2C%20family%3A%20%22IPv4%22%2C%20mac%3A%20%2200%3A00%3A00%3A00%3A00%3A00%22%2C%20internal%3A%20true%2C%20cidr%3A%20%22127.0.0.1%2F8%22%20%7D%5D%20%7D)%3B'

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет $ENV_FILE" >&2
  exit 1
fi

pnpm -C "$ROOT/packages/shared" build
pnpm -C "$ROOT/apps/api" exec tsc -p tsconfig.json

if lsof -tiTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  lsof -tiTCP:"$PORT" -sTCP:LISTEN | xargs kill -9
  sleep 1
fi

# shellcheck disable=SC2046
set -a
# shellcheck source=/dev/null
source <(grep -v '^#' "$ENV_FILE" | sed '/^$/d')
set +a
export PORT API_PORT="$PORT"

cd "$ROOT/apps/api"
nohup node --import "$POLYFILL" dist/server.js >"/tmp/club-api-${PORT}.log" 2>&1 &
echo "spawned pid=$! port=$PORT"
sleep 2
curl -sf "http://127.0.0.1:${PORT}/health"
echo
code=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${PORT}/admin/analytics?range=30d")
echo "GET /admin/analytics → $code (ожидаем 401 без токена)"
