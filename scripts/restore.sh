#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib/ops-common.sh"
ops_init
ops_lock
: "${RESTORE_PROJECT:?Укажите новое имя club-restore-...}"
: "${SNAPSHOT_DIR:?Укажите каталог snapshot-...}"
: "${RESTORE_CODE_DIR:?Укажите чистый checkout версии приложения из снимка}"
RESTORE_MODE="${RESTORE_MODE:-exact}"
[[ "$RESTORE_MODE" = exact || "$RESTORE_MODE" = migrate-legacy ]] || { echo 'RESTORE_MODE: exact или migrate-legacy' >&2; exit 1; }
OPS_REPO_DIR="$REPO_DIR"
[[ -d "$RESTORE_CODE_DIR/.git" || -f "$RESTORE_CODE_DIR/.git" ]] || { echo 'RESTORE_CODE_DIR должен быть git checkout' >&2; exit 1; }
compose=(docker compose --env-file "$ENV_FILE" -f "$RESTORE_CODE_DIR/docker-compose.yml" -f "$DEPLOY_COMPOSE_OVERRIDE")
[[ "$RESTORE_PROJECT" =~ ^club-restore-[a-z0-9-]+$ ]] || { echo 'Разрешён только проект club-restore-*' >&2; exit 1; }
[[ -n "${DEPLOY_COMPOSE_OVERRIDE:-}" ]] || { echo 'Нужен изолированный override с отдельными loopback-портами' >&2; exit 1; }
[[ -z "$(docker ps -aq --filter "label=com.docker.compose.project=$RESTORE_PROJECT")" ]] || { echo 'Целевой проект уже существует; выберите новое имя' >&2; exit 1; }
[[ -z "$(docker volume ls -q --filter "label=com.docker.compose.project=$RESTORE_PROJECT")" ]] || { echo 'У целевого проекта уже есть тома' >&2; exit 1; }
compose+=(-p "$RESTORE_PROJECT")
"${compose[@]}" config --format json | python3 "$OPS_REPO_DIR/scripts/lib/restore-config.py"
export CHECKOUT_DB_USER="$(ops_value CHECKOUT_DB_USER club_api)"
export CHECKOUT_DB_PASSWORD="$(ops_value CHECKOUT_DB_PASSWORD)"
[[ -n "$CHECKOUT_DB_PASSWORD" && "$CHECKOUT_DB_USER" != "$(ops_value POSTGRES_USER)" ]] || { echo 'Нужны отдельный CHECKOUT_DB_USER и его пароль' >&2; exit 1; }

export BACKUP_ENCRYPTION_KEY="$(ops_value BACKUP_ENCRYPTION_KEY)"
work="$(mktemp -d "$BACKUP_DIR/.restore-XXXXXX")"
trap 'rm -rf -- "$work"' EXIT
snapshot="$(realpath "$SNAPSHOT_DIR")"
[[ "$(wc -l < "$snapshot/SHA256SUMS")" = 2 ]]
[[ "$(awk '{print $2}' "$snapshot/SHA256SUMS" | sort)" = $'metadata.json\nsnapshot.tar.gz.enc' ]]
(cd "$snapshot" && sha256sum -c SHA256SUMS)
docker_root="$(docker info --format '{{.DockerRootDir}}')"
python3 - "$snapshot" "$work" "$docker_root" <<'PY'
import json,pathlib,shutil,sys
p=pathlib.Path(sys.argv[1]);metadata=json.loads((p/'metadata.json').read_text())
for key in ('database_bytes','uploads_bytes','payload_bytes','ciphertext_bytes','restore_required_bytes'):
    if not isinstance(metadata[key],int) or not 0 <= metadata[key] < 1024**5: raise ValueError('Некорректный размер в metadata')
if metadata['ciphertext_bytes'] != (p/'snapshot.tar.gz.enc').stat().st_size: raise ValueError('Размер архива не совпал')
minimum=3*(metadata['database_bytes']+metadata['uploads_bytes']+metadata['payload_bytes'])+268435456
for path in sys.argv[2:]:
    if shutil.disk_usage(path).free < max(minimum,metadata['restore_required_bytes']): raise ValueError('Недостаточно места для безопасного восстановления')
PY
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY -in "$snapshot/snapshot.tar.gz.enc" > "$work/snapshot.tar.gz"
python3 - "$work" "$snapshot" <<'PY'
import json, pathlib, sys, tarfile
work = pathlib.Path(sys.argv[1])
metadata=json.loads((pathlib.Path(sys.argv[2])/'metadata.json').read_text())
allowed = {'database.dump','uploads.tar.gz','counts.json','commit.txt','tool-commit.txt','worktree-status.txt','migrations.txt','images.json','created-at.txt','SHA256SUMS'}
with tarfile.open(work/'snapshot.tar.gz') as archive:
    members = archive.getmembers()
    if sum(member.size for member in members) > metadata['payload_bytes']: raise ValueError('Снимок больше заявленного размера')
    for member in members:
        name = member.name.removeprefix('./')
        if name in ('', '.') and member.isdir(): continue
        if name not in allowed or not member.isfile(): raise ValueError('Недопустимый путь в снимке')
        if member.size > 512*1024**3: raise ValueError('Недопустимый размер')
    archive.extractall(work, filter='data')
with tarfile.open(work/'uploads.tar.gz') as archive:
    total=0
    for member in archive.getmembers():
        total+=member.size
        if total>metadata['uploads_bytes']: raise ValueError('Uploads больше заявленного размера')
        path = pathlib.PurePosixPath(member.name)
        if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise ValueError('Недопустимый путь/ссылка в uploads')
for line in (work/'SHA256SUMS').read_text().splitlines():
    if line.split(maxsplit=1)[1].lstrip('*') not in allowed - {'SHA256SUMS'}: raise ValueError('Недопустимый checksum path')
PY
(cd "$work" && sha256sum -c SHA256SUMS)
target_revision="$(git -C "$RESTORE_CODE_DIR" rev-parse HEAD)"
if [[ "$RESTORE_MODE" = exact ]]; then
  [[ "$(cat "$work/commit.txt")" = "$target_revision" ]] || { echo 'RESTORE_CODE_DIR не совпадает с версией приложения в snapshot commit.txt' >&2; exit 1; }
else
  [[ "${LEGACY_APP_REVISION:-}" =~ ^[a-f0-9]{40}$ && "$(cat "$work/commit.txt")" = "$LEGACY_APP_REVISION" ]] || { echo 'Укажите проверенный LEGACY_APP_REVISION снимка старого приложения' >&2; exit 1; }
  [[ -f "$RESTORE_CODE_DIR/backend/migrations/001_native_base.sql" || -f "$RESTORE_CODE_DIR/apps/api/migrations/001_native_base.sql" ]] || { echo 'Для переноса нужен checkout нативной архитектуры' >&2; exit 1; }
fi
[[ ! -s "$work/worktree-status.txt" && -z "$(git -C "$RESTORE_CODE_DIR" status --porcelain)" ]] || { echo 'Снимок и восстановление должны использовать чистый checkout' >&2; exit 1; }
"${compose[@]}" build --build-arg "VCS_REF=$target_revision" postgres api web caddy
"${compose[@]}" up -d --wait --no-deps postgres
pg="$("${compose[@]}" ps -q postgres)"
"${compose[@]}" exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --no-acl' < "$work/database.dump"
"${compose[@]}" up --no-start --no-deps api
files="$("${compose[@]}" ps -aq api)"
image="$(ops_helper_image "$pg")"
docker run --rm -i --network none --volumes-from "$files" --entrypoint sh "$image" -c 'tar -C /data/uploads -xzf - && chown -R 1000:1000 /data/uploads' < "$work/uploads.tar.gz"
"${compose[@]}" exec -T postgres sh -c 'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At' > "$work/restored-counts.json" <<'SQL'
SELECT json_build_object('alumni',(SELECT count(*) FROM alumni),'orders',(SELECT count(*) FROM orders),'points_ledger',(SELECT count(*) FROM points_ledger),'directus_files',(SELECT count(*) FROM directus_files));
SQL
python3 - "$work" <<'PY'
import json,pathlib,sys
p=pathlib.Path(sys.argv[1]); assert json.loads((p/'counts.json').read_text()) == json.loads((p/'restored-counts.json').read_text()), 'Количество строк не совпало'
PY
if [[ "$RESTORE_MODE" = migrate-legacy ]]; then
  "${compose[@]}" build --build-arg "VCS_REF=$target_revision" migrate bootstrap
  "${compose[@]}" run --rm --no-deps migrate
  "${compose[@]}" run --rm --no-deps bootstrap
else
  runtime_role_sql="$RESTORE_CODE_DIR/backend/sql/runtime-role.sql"
  if [[ ! -f "$runtime_role_sql" ]]; then runtime_role_sql="$RESTORE_CODE_DIR/scripts/runtime-role.sql"; fi
  [[ -f "$runtime_role_sql" ]] || { echo 'В закреплённом checkout нет SQL-прав runtime' >&2; exit 1; }
  docker exec -i -e CHECKOUT_DB_USER -e CHECKOUT_DB_PASSWORD "$pg" sh -c 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < "$runtime_role_sql"
fi
"${compose[@]}" up -d --wait --no-deps mailpit
"${compose[@]}" up -d --wait --no-deps api web caddy
echo "БД и файлы восстановлены в $RESTORE_PROJECT. Проверьте HTTPS, вход, данные и медиа до переключения пользователей. Исходный проект не изменён."
