# Сборка Caddy с актуальными зависимостями

Решение от 30 сентября 2026 года: сохранить стабильный Caddy 2.11.4 и перенести
официальные правки совместимости с актуальными CEL и automemlimit.

## Основание

Прежние CEL 0.28.1 и automemlimit 0.7.5 удерживались изменениями API. CEL входил
в диапазон [GO-2026-6094](https://pkg.go.dev/vuln/GO-2026-6094): NativeTypes мог
раскрывать поля `json:"-"`. Замена библиотеки устраняет уязвимую версию.

Теперь используются `cel.dev/cel-go 0.32.0` и `automemlimit 1.0.0`. Правки
стабильных исходников находятся в
[compatibility.patch](../../deploy/caddy/compatibility.patch):

| Upstream commit | Перенесённая правка |
|---|---|
| [d0e93c2](https://github.com/caddyserver/caddy/commit/d0e93c23a1ca0e542916392c401a13d6870b8204) | `SetGoMemLimitWithOpts` → `Set` |
| [b2693fb](https://github.com/caddyserver/caddy/commit/b2693fb63a30e6d7be0972c3645e9a2c0a500e93) | Два аргумента `NewCall` используют `InterpretableV2` |
| [df77f8b](https://github.com/caddyserver/caddy/commit/df77f8bde1a8d00f6c7043291325dd6b1f82742e) | Импорты переходят на `cel.dev/cel-go` |

Из последней правки перенесены пять существующих в 2.11.4 файлов. Новый
`urlpatternmatcher.go` из ветки разработки не добавляется. Всего изменены шесть
файлов upstream. Патч позволяет обновить обе зависимости, сохранив
настройки TLS, локальной CA, proxy headers, маршрутов и лимитов Caddy.

## Воспроизводимая сборка

Сборку задают [edge.Dockerfile](../../deploy/edge.Dockerfile), `go.mod` и `go.sum`.
Module cache проверяется до копирования и остаётся неизменным.
[prepare.sh](../../deploy/caddy/prepare.sh) применяет патч без fuzz к копии
источника. [vendor.sh](../../deploy/caddy/vendor.sh) временно задаёт локальный
`replace`: `go mod tidy` и `go mod vendor` читают исправленный граф импортов.
Это учитывает [ограничение Go](https://pkg.go.dev/cmd/go#hdr-Compile_packages_and_dependencies)
на замену файлов внутри `GOMODCACHE` через overlay.

После подготовки vendor локальный `replace` удаляется из `go.mod` и его
метаданных. Базовая версия upstream сохраняется; применение патча явно указано
в label образа. Контрольные суммы и `go.mod` должны совпасть с lockfile.
Компилятор, Go-тесты и govulncheck используют исправленный vendor. Обычная сборка
требует неизменных lockfile. Build info проверяет версии CEL/automemlimit и
отсутствие прежнего CEL. Метаданные бинарника сохраняют базовый Caddy 2.11.4;
label `club.caddy.backports` указывает перенесённые commits.

В финальные web/edge образы копируются бинарник, лицензия и рабочая статика.
Module cache, vendor, Go-компилятор, патч и тесты остаются в builder.

## Проверка

```bash
docker build -f deploy/edge.Dockerfile --target edge-check -t club-edge-check .
python3 scripts/tests/test-edge.py \
  --edge-image club-ci-live-caddy \
  --web-image club-ci-live-web \
  --api-image club-ci-live-api
```

Первый шаг проверяет сборку, скрытые/публичные JSON-поля, обычные CEL matcher
и достижимые Go-уязвимости. Второй использует конечные образы и штатные Caddyfile.
HTTP-фикстура вместо API читает тело и показывает переданный путь и proxy
headers; отдельный `test-live.sh` проверяет настоящий Django/PostgreSQL.

TLS проверяется стандартным клиентом с собственной CA, без отключения проверки
сертификата. Тест также проверяет reload, legacy assets/redirect, SPA/404, CSP,
кэш, gzip, подделку proxy headers, границы трёх лимитов тел, заголовки и
cgroup memory CLI. Контейнеры и сети получают уникальные имена и удаляются
самим тестом. Рабочие данные не используются; localhost не вызывает внешний ACME.

## Обновление зависимостей

После изменения версий в `deploy/caddy/go.mod` экспортируйте lockfile во
временный каталог:

```bash
edge_lock_dir="$(mktemp -d)"
docker build -f deploy/edge.Dockerfile --target edge-lock-export \
  --output "type=local,dest=$edge_lock_dir" .
cp "$edge_lock_dir/go.mod" "$edge_lock_dir/go.sum" deploy/caddy/
docker build -f deploy/edge.Dockerfile --target edge-check -t club-edge-check .
```

Перечитайте diff lockfile и патча, затем запустите полный CI. При
обновлении базового Caddy сверяйте backports с новым релизом: уже включённые
правки удаляются из патча. Проверка версии источника меняется вместе с `go.mod`. Ошибка применения патча останавливает сборку.

Обновление рабочего стека и откат выполняются по
[runbook](../operations/deploy-runbook.md). Сертификаты, PostgreSQL и uploads
сохраняются в существующих томах.
