# Проверка проекта

Зависимости API, web и команд оператора закреплены в трёх `uv.lock`.
Для разработки нужны Python 3.14 и uv; для SQL и полного приложения – Docker.

## Быстрые проверки

Из корня репозитория:

```bash
uv sync --directory backend --frozen
uv sync --directory frontend --frozen
uv sync --directory scripts --frozen
uv run --directory frontend playwright install chromium
uv run --directory backend ruff check club_api tests/python ../scripts/club_ops
uv run --directory backend ruff format --check club_api tests/python ../scripts/club_ops
uv run --directory frontend ruff check club_web tests/python
uv run --directory frontend ruff format --check club_web tests/python
uv run --directory frontend python ../scripts/checks/check-comments.py
uv run --directory frontend python -m club_web.build --output /tmp/club-web
uv run --directory frontend python ../scripts/checks/check-web-build.py /tmp/club-web
uv run --directory backend pytest -q
uv run --directory frontend pytest -q
uv run --directory frontend python ../scripts/tests/test-comments.py
uv run --directory backend python ../scripts/tests/test-measure-load.py
python3 scripts/tests/test-ops.py
python3 scripts/tests/test-install.py
```

Без тестовой БД SQL-сценарии пропускаются. Пропуск не означает успешной проверки
сохранения данных. Live-сценарии выполняются отдельной командой ниже.

## Что проверяют тесты

| Область | Проверка |
|---|---|
| API и данные | Права ролей и SQL-роль, PHC/JWT, регистрация, платежные повторы, сумма и резерв |
| Web и шаблоны | Публичные страницы, кабинет и офис, экранирование HTML, ссылки, ошибки API |
| Браузер | Все разделы на 1440 и 390 px, поиск, сравнение, корзина, ошибки оформления, сохранённое, PWA, Telegram и плеер |
| Дайджест | Разбор источника, даты, ссылки, объём, пагинация, обновление и сохранение архива при ошибке |
| Операции | Конфигурация, установщик, копия, восстановление, нагрузочные ограничения и TLS |
| Выпуск | Собственные скомпилированные модули, разрешённые шаблоны/статика, отсутствие исходников, тестов и демоданных |

Источники: [API](../../backend/tests/python), [web](../../frontend/tests/python),
[операции](../../scripts/tests). Подмена внешнего провайдера проверяет контракт,
но не подтверждает доставку реальной почты, оплату или работу Telegram.

## Настоящий PostgreSQL

```bash
bash scripts/tests/test-integration.sh
```

Команда создаёт отдельный контейнер с tmpfs и случайным локальным портом,
применяет миграции, индексы и ограниченную SQL-роль, затем запускает pytest.
Контейнер удаляется после теста. Фикстура принимает только БД
`django_migration_test`. Приложение проверяется через HTTPX с его lifespan.

Фикстура [legacy-auth.json](../../backend/tests/python/legacy-auth.json)
проверяет совместимость с синтетическими PHC-хешами и JWT прежнего сервера.

## Браузер с настоящими сервисами

```bash
uv run --directory frontend playwright install --with-deps chromium
bash scripts/tests/test-live.sh
```

Стенд использует отдельный проект `club-ci-live`, loopback-порты 8180–8182
и Mailpit. Проверяются регистрация, письмо подтверждения, вход, роли, профиль,
медиа, корзина и заявка, подписка, события, отзыв сессии и восстановление доступа.
Через формы офиса создаются, изменяются и удаляются программы, товары, новости,
события, подкасты и записи истории. Проверяются публикация новости из источника,
скрытие публикации, редактирование главной, CSV, скидка, баллы и выдача подписки.
В кабинете проверяются фото, интересы и выгрузка данных; в поддержке – обращение,
ответ, продолжение переписки, закрытие и удаление. После рестарта проверяются
приглашение в друзья, принятие и удаление связи. В каждом браузере открываются
22 раздела сайта и 16 разделов офиса с настоящим API и проверкой ширины страницы.
Затем создаётся зашифрованная копия, повторяются bootstrap и миграции,
перезапускаются сервисы и проверяется чтение сохранённых данных. Эта команда
создаёт копию; отдельное восстановление выполняется по
[runbook](../operations/deploy-runbook.md#изолированное-восстановление).

Десктоп и телефон используют одну реализацию сервера. Контейнеры и тома стенда
удаляются после теста. Команда отказывается использовать существующий проект
с тем же именем.

## Безопасность и содержимое образов

```bash
bash scripts/checks/check-runtime-images.sh API_IMAGE BOOTSTRAP_IMAGE WEB_IMAGE
```

Собственные Python-пакеты поставляются как `.pyc` и необходимые JSON; web
добавляет Jinja2-шаблоны и публичные CSS, JavaScript, изображения и шрифты.
API не содержит каталога bootstrap и демозаписей. Web не содержит экспортёра
зеркала, его данных и браузерного помощника. Сторонние библиотеки и их лицензии
сохраняются. Node, npm, pnpm, uv, pip, pytest и линтеры в runtime отсутствуют.
UID приложения – 1000.

[CI](../../.github/workflows/ci.yml) проверяет зависимости каждого Python-пакета
через pip-audit, пять образов через Trivy (High/Critical), Go-модули Caddy,
текущие файлы через Gitleaks, а также установку и повторный запуск на Ubuntu.
Лицензионные уведомления и shebang допускаются проверкой комментариев.

## Как фиксировать результат

Указывайте SHA, команду, код завершения и окружение. Результат PR относится
к его проверенному коммиту; после слияния сверяется отдельный CI `main`.
Пароли, JWT, ссылки подтверждения, переписку и полный env в отчёт не копируют.
Команды выпуска и отката находятся в [runbook](../operations/deploy-runbook.md).
