#!/bin/sh
# Overlay задаёт граф импортов для vendor; проверенный module cache остаётся целым.
set -eu

test "$PWD" = /caddy
module_dir="$(go list -m -f '{{.Dir}}' github.com/caddyserver/caddy/v2)"
test "$module_dir" = /go/pkg/mod/github.com/caddyserver/caddy/v2@v2.11.4
go mod verify
mkdir patched
cp -a "$module_dir/." patched/
chmod -R u+w patched
patch --batch --fuzz=0 --strip=1 --directory=patched < compatibility.patch

status=0
grep -r -l '"github.com/google/cel-go/' patched || status=$?
case "$status" in
  1) ;;
  0) echo 'Остались импорты прежнего CEL; пересмотрите backport.' >&2; exit 1 ;;
  *) exit "$status" ;;
esac
