#!/bin/sh
set -eu

test "$PWD" = /caddy
test "$#" = 1
test "$1" = vendor || test "$1" = tidy

go mod edit -replace=github.com/caddyserver/caddy/v2=/caddy/patched
go mod "$1"
go mod edit -dropreplace=github.com/caddyserver/caddy/v2

if test "$1" = vendor; then
  cmp go.mod locked/go.mod
  cmp go.sum locked/go.sum
  sed -e '/^# github.com\/caddyserver\/caddy\/v2 => \/caddy\/patched$/d' \
      -e 's| => /caddy/patched$||' vendor/modules.txt > vendor/modules.txt.next
  mv vendor/modules.txt.next vendor/modules.txt
  test ! -d vendor/github.com/google/cel-go
else
  go mod download github.com/caddyserver/caddy/v2
fi
