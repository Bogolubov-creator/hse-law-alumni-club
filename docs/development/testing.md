# Тестирование

Результат относится к конкретному коммиту и окружению. Состояние локальных
проверок и CI фиксируется в [журнале](../operations/project-state.md).

## Окружение

API и команды оператора: Python 3.14.7, uv и зависимости из двух `uv.lock`.
Интерфейс: Node.js 24.21.0, pnpm 12.8.1, `pnpm-lock.yaml`.
Для SQL, браузерных и установочных сценариев нужен Docker. Обслуживание через
`backup.sh`, `restore.sh` и `deploy.sh` выполняется на Ubuntu с `flock`.

Внешние платежи, Telegram, push и Sentry в тестовом стеке выключены. Почта
поступает в Mailpit. Тесты создают синтетические аккаунты и собственные тома;
проверки не разрешают подключаться к рабочей базе.

## Что проверяет каждый набор

| Набор | Что проверяется | Команда |
|---|---|---|
| Python и PostgreSQL | Контракты 117 маршрутов, auth, роли, транзакции, остатки, повторные платежи, поддержка, медиа, подписки, bootstrap | `bash scripts/tests/test-integration.sh` |
| Интерфейс и общие функции | Формы, маршруты, расчёты, схемы данных и обработка ответов | `pnpm -r test` |
| Shell/Python операции | Конфигурация, установка, копии и ограничения операций | `python3 scripts/tests/test-ops.py`, `python3 scripts/tests/test-install.py` |
| Live stack | Реальные web/API/PostgreSQL/Caddy, почта, роли, запись и чтение после перезапуска | `bash scripts/tests/test-live.sh` |
| Состав образов | Скомпилированный собственный Python, рабочие зависимости, отсутствие тестов, исходников и демоданных в API | `bash scripts/checks/check-runtime-images.sh API_IMAGE BOOTSTRAP_IMAGE WEB_IMAGE` |
| TLS и периметр | Caddy, localhost CA, заголовки, ограничения и маршруты | `python3 scripts/tests/test-edge.py` |
| Установка Ubuntu | Первый и повторный запуск, TLS, readiness, вход и сохранность конфигурации | `bash scripts/tests/test-install.sh` |
| Зависимости и секреты | Известные уязвимости Python/npm/образов и случайно добавленные ключи | pip-audit, pnpm audit, Trivy, Gitleaks в CI |

## Матрица пользовательских сценариев

| Сценарий | Проверка |
|---|---|
| Регистрация и подтверждение | Согласие, серверная роль alumni, почтовая ссылка, повторная доставка |
| Пароли и сессии | Legacy Argon2/JWT, одноразовый reset, отзыв admin JWT, текущая роль и provider/MFA |
| Офис | Ограничения редактора, подтверждение выпуска, скидка, баллы, CSV |
| Заявка | Серверная цена, скидка, UUID корзины, идемпотентность и последняя единица склада |
| Платёж | IP, отдельный запрос провайдеру, сумма RUB, подделка, повтор и конкурентная доставка |
| Мероприятия | RSVP, посещение, однократное начисление баллов и ICS |
| Поддержка | Версия согласия, код доступа, повтор, закрытие и удаление обращения |
| Медиа | Сигнатура, лимиты, ссылки на файл, Range, приватность аватара и symlink |
| Подкасты | Повтор заявки без активации, подпись ссылки, текущая подписка и учёт прослушивания |
| Импорт | Безопасный INITIAL_STATE, неполный каталог, сохранение редакторских полей и даты новостей |
| Обслуживание | SQL-права runtime, повторный bootstrap, сохранность данных и доступ после рестарта |

Исходники сценариев: [Python](../../backend/tests/python),
[браузер](../../frontend/tests/e2e), [операции](../../scripts/tests).
Подменённый ответ ЮKassa или Telegram не доказывает работу реального провайдера.

## Установка и быстрые проверки

Из корня репозитория:

```bash
uv sync --directory backend --frozen
uv sync --directory scripts --frozen
pnpm install --frozen-lockfile
pnpm lint
uv run --directory backend --frozen ruff format --check club_api tests/python ../scripts/club_ops
pnpm -r build
pnpm -r test
pnpm audit --prod --audit-level high
python3 scripts/tests/test-ops.py
python3 scripts/tests/test-install.py
node scripts/checks/check-web-build.mjs frontend/dist
```

Для Python-тестов без PostgreSQL можно выбрать файлы `test_domain.py`,
`test_security.py` и `test_push.py`. Интеграционные проверки запускайте следующей
командой: пропущенный из-за отсутствия БД тест не считается успешной проверкой SQL.

## Настоящий PostgreSQL

```bash
bash scripts/tests/test-integration.sh
```

Runner создаёт контейнер с tmpfs и случайным локальным портом, применяет миграции,
индексы и ограниченную SQL-роль, затем запускает pytest. Контейнер удаляется в
trap. Имя БД строго `fastapi_migration_test`; иной адрес fixture отклоняет.
Приложение проверяется через HTTPX ASGI с настоящим lifespan.

Фикстура [legacy-auth.json](../../backend/tests/python/legacy-auth.json) создана
прежней Node-реализацией с синтетическим паролем и секретом. Она проверяет
чтение сохранённых PHC/JWT после удаления TypeScript-сервера.

## Браузер с настоящими сервисами

```bash
pnpm --filter @club/web exec playwright install --with-deps chromium
bash scripts/tests/test-live.sh
```

Ubuntu runner использует отдельный проект `club-ci-live`, локальные порты
8180–8182 и Mailpit. Проверяются регистрация, подтверждение, вход, роль редактора,
профиль, медиа, заявка, резервная копия, повторный bootstrap и чтение после
перезапуска сервисов. Десктоп и телефон используют одну серверную реализацию.
Стек и его тома удаляются после теста; существующий проект с этим именем
runner отказывается использовать.

Для публичного сайта и Safari доступны сценарии из `frontend/tests/e2e`:

```bash
pnpm --filter @club/web exec playwright install chromium webkit
E2E_BASE_URL=http://localhost pnpm --filter @club/web e2e --project=desktop --project=mobile tests/e2e/public.spec.ts tests/e2e/auth-recovery.spec.ts tests/e2e/admin.spec.ts
pnpm --filter @club/web e2e:safari
```

## Содержимое выпуска

```bash
bash scripts/checks/check-runtime-images.sh API_IMAGE BOOTSTRAP_IMAGE WEB_IMAGE
```

Собственные Python-пакеты в финальном образе состоят из `.pyc` и нужных JSON.
API не содержит пакета команд оператора, каталога bootstrap или демозаписей.
Сторонние библиотеки поставляются со своими файлами и лицензиями. Node/pnpm/uv,
pytest, линтеры и pip в рабочих Python-образах отсутствуют. UID приложения – 1000.

Web содержит публичную статику без исходников, sourcemap и демоперехватчика.
Комментарии собственной TypeScript-сборки проверяет
`check-compiled-comments.mjs`; лицензионные комментарии допускаются.

## Как фиксировать доказательство

Указывайте SHA, команду, exit code, окружение и фактический результат.
Проверка exact head PR предшествует слиянию; после слияния проверяется CI `main`.
Пароли, JWT, почтовые ссылки, тела поддержки и полный env в отчёт не копируются.
Для обновления целевого сервера нужны копия, сверка после деплоя и путь отката
из [runbook](../operations/deploy-runbook.md).
