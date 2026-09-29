#!/usr/bin/env bash
# Общие настройки операций. Файл env читается как данные, никогда как shell-код.
ops_value() {
  python3 - "$ENV_FILE" "$1" "${2:-}" <<'PY'
import os, shlex, sys
path, key, default = sys.argv[1:]
if key in os.environ:
    print(os.environ[key]); sys.exit()
values = {}
with open(path) as source:
    for raw in source:
        line = raw.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        name, value = line.split('=', 1)
        tokens = shlex.split(value, comments=True)
        values[name.strip()] = ' '.join(tokens)
print(values.get(key, default))
PY
}

ops_init() {
  umask 077
  REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  : "${ENV_FILE:?Укажите ENV_FILE вне репозитория}"
  [[ "$ENV_FILE" = /* && -f "$ENV_FILE" ]] || { echo 'ENV_FILE должен быть абсолютным путём к файлу' >&2; return 1; }
  ENV_FILE="$(realpath "$ENV_FILE")"
  case "$ENV_FILE" in "$REPO_DIR"/*) echo 'Храните рабочий env вне репозитория' >&2; return 1;; esac
  BACKUP_DIR="${BACKUP_DIR:-/var/backups/club}"
  STATE_DIR="${STATE_DIR:-/var/lib/club-ops}"
  compose=(docker compose --env-file "$ENV_FILE" -f "$REPO_DIR/docker-compose.yml")
  if [[ -n "${DEPLOY_COMPOSE_OVERRIDE:-}" ]]; then
    [[ "$DEPLOY_COMPOSE_OVERRIDE" = /* && -f "$DEPLOY_COMPOSE_OVERRIDE" ]] || return 1
    compose+=(-f "$DEPLOY_COMPOSE_OVERRIDE")
  fi
  mkdir -p "$STATE_DIR" "$BACKUP_DIR"
  chmod 700 "$STATE_DIR" "$BACKUP_DIR"
  cd "$REPO_DIR"
}

ops_lock() {
  exec 9>"$STATE_DIR/maintenance.lock"
  flock -n 9 || { echo 'Другая операция обслуживания уже выполняется' >&2; return 1; }
}

ops_http_check() {
  local base
  base="$(ops_value PUBLIC_URL)"
  local args=(--fail --silent --show-error --max-time 20 --retry 10 --retry-delay 2 --retry-all-errors)
  if [[ -n "${HTTPS_CA_FILE:-}" ]]; then args+=(--cacert "$HTTPS_CA_FILE"); fi
  curl "${args[@]}" "$base/api/ready" | python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "ok"'
  curl "${args[@]}" "$base/" | python3 -c 'import sys; assert "<html" in sys.stdin.read().lower()'
}
