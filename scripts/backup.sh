#!/usr/bin/env bash
# Один снимок БД и файлов: на время чтения остановлен API.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/ops-common.sh"

backup_snapshot() (
  ops_assert_native_project
  local pg files image work partial output stamp key remote keep application_revision api_id web_id
  local -a stopped=()
  key="$(ops_value BACKUP_ENCRYPTION_KEY)"
  [[ "$key" =~ ^[a-fA-F0-9]{64}$ ]] || { echo 'Нужен BACKUP_ENCRYPTION_KEY: 64 hex-символа' >&2; exit 1; }
  export BACKUP_ENCRYPTION_KEY="$key"
  keep="$(ops_value BACKUP_KEEP_DAYS 14)"
  [[ "$keep" =~ ^[0-9]+$ && "$keep" -ge 1 ]] || { echo 'BACKUP_KEEP_DAYS должен быть положительным числом' >&2; exit 1; }
  remote="$(ops_value BACKUP_OFFSITE_REMOTE)"
  if [[ -n "$remote" ]]; then command -v rclone >/dev/null; fi
  pg="$("${compose[@]}" ps -q postgres)"
  files="$("${compose[@]}" ps -aq api)"
  [[ -n "$pg" && -n "$files" ]] || { echo 'Для снимка нужны PostgreSQL и созданный контейнер API' >&2; exit 1; }
  api_id="$("${compose[@]}" ps -aq api)"
  web_id="$("${compose[@]}" ps -aq web)"
  application_revision="$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$api_id")"
  if [[ ! "$application_revision" =~ ^[a-f0-9]{40}$ ]]; then
    application_revision="${ADOPT_DEPLOYED_REVISION:-}"
    [[ "$application_revision" =~ ^[a-f0-9]{40}$ ]] || { echo 'Старые образы без revision label: укажите подтверждённый ADOPT_DEPLOYED_REVISION по runbook' >&2; exit 1; }
  else
    [[ "$(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$web_id")" = "$application_revision" ]] || { echo 'Версии API и web различаются; сначала разберите незавершённый выпуск' >&2; exit 1; }
  fi
  git cat-file -e "$application_revision^{commit}"
  image="$(ops_helper_image "$pg")"
  stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  work="$(mktemp -d "$BACKUP_DIR/.work-$stamp-XXXXXX")"
  partial="$BACKUP_DIR/.snapshot-$stamp.partial"
  output="$BACKUP_DIR/snapshot-$stamp"
  mkdir "$partial"
  resume_stopped() {
    local service container health attempt
    # Возвращаем те же контейнеры: Compose start может повторно запустить bootstrap.
    for service in "${stopped[@]}"; do
      container="$("${compose[@]}" ps -aq "$service")"
      docker start "$container" >/dev/null || return 1
      for attempt in $(seq 1 60); do
        health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")" || return 1
        [[ "$health" = healthy || "$health" = running ]] && break
        sleep 1
      done
      [[ "$health" = healthy || "$health" = running ]] || return 1
    done
  }
  cleanup() {
    local result=$?
    if ((${#stopped[@]})); then
      if ! resume_stopped; then
        echo 'Не удалось вернуть сервисы после копирования; проверьте compose ps' >&2
        result=1
      fi
    fi
    rm -rf -- "$work" "$partial"
    exit "$result"
  }
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM
  for service in api; do
    if [[ -n "$("${compose[@]}" ps --status running -q "$service")" ]]; then stopped+=("$service"); fi
  done
  if ((${#stopped[@]})); then "${compose[@]}" stop --timeout 60 "${stopped[@]}"; fi
  local db_bytes upload_bytes available
  db_bytes="$("${compose[@]}" exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select pg_database_size(current_database())"')"
  upload_bytes="$(docker run --rm --network none --volumes-from "$files:ro" --entrypoint du "$image" -sk /data/uploads | awk '{print $1 * 1024}')"
  available="$(df -Pk "$BACKUP_DIR" | awk 'NR==2 {printf "%.0f", $4*1024}')"
  (( available >= 3 * (db_bytes + upload_bytes) + 268435456 )) || { echo 'Недостаточно места для копии и временных файлов' >&2; exit 1; }
  "${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner --no-acl' > "$work/database.dump"
  docker run --rm --network none --volumes-from "$files:ro" --entrypoint tar "$image" -C /data/uploads -czf - . > "$work/uploads.tar.gz"
  "${compose[@]}" exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' > "$work/counts.json" <<'SQL'
SELECT json_build_object('alumni',(SELECT count(*) FROM alumni),'orders',(SELECT count(*) FROM orders),'points_ledger',(SELECT count(*) FROM points_ledger),'directus_files',(SELECT count(*) FROM directus_files));
SQL
  python3 - "$work/counts.json" <<'PY'
import json,sys
counts=json.load(open(sys.argv[1]))
if set(counts) != {'alumni','orders','points_ledger','directus_files'} or not all(type(v) is int and v >= 0 for v in counts.values()):
    raise ValueError('Не удалось проверить счётчики снимка')
PY
  if [[ "${1:-}" != keep-stopped ]] && ((${#stopped[@]})); then
    resume_stopped
    stopped=()
  fi
  printf '%s\n' "$application_revision" > "$work/commit.txt"
  git rev-parse HEAD > "$work/tool-commit.txt"
  git status --porcelain > "$work/worktree-status.txt"
  git ls-tree -r "$application_revision" -- apps/api/migrations infra/indexes.sql > "$work/migrations.txt"
  docker inspect "$api_id" "$web_id" "$pg" "$files" | python3 -c 'import json,sys; print(json.dumps([{ "image":r["Image"],"service":r["Config"]["Labels"]["com.docker.compose.service"]} for r in json.load(sys.stdin)],indent=2))' > "$work/images.json"
  date -u +%FT%TZ > "$work/created-at.txt"
  (cd "$work" && sha256sum database.dump uploads.tar.gz counts.json commit.txt tool-commit.txt worktree-status.txt migrations.txt images.json created-at.txt > SHA256SUMS)
  tar -C "$work" -czf - . | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -out "$partial/snapshot.tar.gz.enc"
  python3 - "$partial" "$work" "$db_bytes" "$upload_bytes" "$application_revision" <<'PY'
import json,pathlib,sys
dest,work=map(pathlib.Path,sys.argv[1:3]);db,uploads=map(int,sys.argv[3:5])
payload=sum(p.stat().st_size for p in work.iterdir())
metadata={'application_revision':sys.argv[5],'database_bytes':db,'uploads_bytes':uploads,'payload_bytes':payload,
          'ciphertext_bytes':(dest/'snapshot.tar.gz.enc').stat().st_size,
          'restore_required_bytes':3*(db+uploads+payload)+268435456}
(dest/'metadata.json').write_text(json.dumps(metadata)+'\n')
PY
  (cd "$partial" && sha256sum snapshot.tar.gz.enc metadata.json > SHA256SUMS)
  # Чтение всего потока обнаруживает усечение до публикации снимка.
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$partial/snapshot.tar.gz.enc" | tar -tzf - >/dev/null
  mv "$partial" "$output"
  if [[ -n "$remote" ]]; then
    rclone copy "$output" "$remote/$(basename "$output")"
    rclone check "$output" "$remote/$(basename "$output")" --one-way --download
  fi
  python3 - "$STATE_DIR" "$output" "$remote" "$BACKUP_DIR" "$keep" <<'PY'
import json, os, pathlib, shutil, sys, time
state, output, remote, backups, days = sys.argv[1:]
record = {"completed_at": int(time.time()), "snapshot": output, "offsite_verified": bool(remote)}
temporary = pathlib.Path(state) / 'last-backup.json.partial'
temporary.write_text(json.dumps(record) + '\n')
os.replace(temporary, pathlib.Path(state) / 'last-backup.json')
for path in pathlib.Path(backups).glob('snapshot-*'):
    if path.is_dir() and not path.is_symlink() and str(path) != output and path.stat().st_mtime < time.time()-int(days)*86400:
        shutil.rmtree(path)
PY
  echo "Снимок создан: $output; offsite: $([[ -n "$remote" ]] && echo проверен || echo не_настроен)"
  # Деплой продолжает окно обслуживания до миграций. При ошибке trap вернёт сервисы.
  if [[ "${1:-}" = keep-stopped ]]; then stopped=(); fi
)

if [[ "${BASH_SOURCE[0]}" = "$0" ]]; then
  ops_init
  ops_lock
  backup_snapshot
fi
