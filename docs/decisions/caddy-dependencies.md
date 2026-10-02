# Сборка Caddy с актуальными зависимостями

Обновление решения от 2 октября 2026 года: использовать официальный Caddy 2.11.6
с CEL 0.32.0 и automemlimit 1.0.0. Локальный патч совместимости удалён.

## Основание

В Caddy 2.11.4 обновление CEL и automemlimit требовало переноса официальных правок.
Прежний CEL входил в диапазон
[GO-2026-6094](https://pkg.go.dev/vuln/GO-2026-6094): NativeTypes мог раскрывать
поля `json:"-"`. В [выпуск 2.11.6](https://github.com/caddyserver/caddy/releases/tag/v2.11.6)
вошли новый API `memlimit.Set`, `InterpretableV2` и импорты `cel.dev/cel-go`.
Повторно применять эти правки не требуется.

## Воспроизводимая сборка

[edge.Dockerfile](../../deploy/edge.Dockerfile), `go.mod` и `go.sum` задают
официальные исходники и контрольные суммы. Module cache проверяется через
`go mod verify`. Builder формирует vendor без локальных замен модуля Caddy.
Build info проверяет CEL 0.32.0, automemlimit 1.0.0 и отсутствие прежнего CEL.

Финальный образ использует закреплённый Alpine 3.24.2 и собственный бинарник
Caddy 2.11.6. Каталоги `/config` и `/data`, CA-сертификаты, MIME-типы и команда запуска
соответствуют официальному образу. Бинарник не получает file capabilities:
он должен запускаться с `cap_drop: ALL` и `no-new-privileges`.
Настройки приложения берутся из `deploy/Caddyfile` и выбранного Compose-контура.
Go-компилятор, module cache, vendor и тесты остаются в builder.

## Проверка

```bash
docker build -f deploy/edge.Dockerfile --target edge-check -t club-edge-check .
python3 scripts/tests/test-edge.py \
  --edge-image club-ci-live-caddy \
  --web-image club-ci-live-web \
  --api-image club-ci-live-api
```

Первый шаг проверяет сборку, скрытые и публичные JSON-поля, CEL matcher
и достижимые Go-уязвимости. Второй использует конечные образы и штатные Caddyfile.
HTTP-фикстура вместо API проверяет пути и proxy headers; `test-live.sh` проверяет
настоящее приложение Django/PostgreSQL.

TLS проверяется стандартным клиентом с собственной CA. Проверяются reload,
legacy assets/redirect, SPA/404, CSP, кэш, gzip, подделка proxy headers,
лимиты тел/заголовков и cgroup memory CLI. Контейнеры и сети получают уникальные
имена и удаляются самим тестом. Рабочие данные не используются.

## Обновление зависимостей

После изменения версий в `deploy/caddy/go.mod` экспортируйте lockfile:

```bash
edge_lock_dir="$(mktemp -d)"
docker build -f deploy/edge.Dockerfile --target edge-lock-export \
  --output "type=local,dest=$edge_lock_dir" .
cp "$edge_lock_dir/go.mod" "$edge_lock_dir/go.sum" deploy/caddy/
docker build -f deploy/edge.Dockerfile --target edge-check -t club-edge-check .
```

Перечитайте diff, затем запустите полный CI. Обычная сборка требует неизменных
lockfile. При обновлении Caddy проверьте release notes, совместимость Caddyfile
и TLS-тесты. Обновление рабочего стека и откат выполняются по
[runbook](../operations/deploy-runbook.md). Сертификаты, PostgreSQL и uploads
сохраняются в существующих томах.
