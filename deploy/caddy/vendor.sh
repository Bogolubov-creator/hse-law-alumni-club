#!/bin/sh
set -eu

test "$PWD" = /caddy
test "$#" = 1
test "$1" = vendor || test "$1" = tidy

# Go не гарантирует overlay внутри GOMODCACHE; граф читается из исправленной копии.
go mod edit -replace=github.com/caddyserver/caddy/v2=/caddy/patched
go mod "$1"
go mod edit -dropreplace=github.com/caddyserver/caddy/v2

if test "$1" = vendor; then
  cmp go.mod locked/go.mod
  cmp go.sum locked/go.sum
  # Vendor содержит патч; метаданные сохраняют проверенную базовую версию upstream.
  sed -e '/^# github.com\/caddyserver\/caddy\/v2 => \/caddy\/patched$/d' \
      -e 's| => /caddy/patched$||' vendor/modules.txt > vendor/modules.txt.next
  mv vendor/modules.txt.next vendor/modules.txt
  test ! -d vendor/github.com/google/cel-go
else
  # Tidy исключает контрольные суммы заменённого модуля; prepare.sh проверяет их до патча.
  go mod download github.com/caddyserver/caddy/v2
fi
