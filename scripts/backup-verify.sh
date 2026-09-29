#!/usr/bin/env bash
# Проверка требует реального восстановления в новый проект, а не только чтения архива.
set -euo pipefail
: "${RESTORE_PROJECT:?Задайте отдельный club-restore-* по docs/deploy-runbook.md}"
exec bash "$(dirname "${BASH_SOURCE[0]}")/restore.sh" "$@"
