#!/usr/bin/env bash
set -euo pipefail

if [[ "${GITHUB_ACTIONS:-}" != "true" || ! -f /etc/apt/apt-mirrors.txt ]]; then
  printf '%s\n' 'Эта настройка предназначена для Ubuntu в GitHub Actions.' >&2
  exit 1
fi

printf '%s\tpriority:%s\n' \
  'https://archive.ubuntu.com/ubuntu/' 1 \
  'https://security.ubuntu.com/ubuntu/' 2 \
  | sudo tee /etc/apt/apt-mirrors.txt > /dev/null
