> Обновление: снимок подготовлен для публикации в ветке `codex/v3` как «Версия 3 · Codex». [Описание версии](../../VERSION.md). Ниже сохранён журнал локального этапа; сведения об отсутствии коммита относятся к моменту его написания.

# Локальная версия и запуск

Интерфейс обновлён после замечания пользователя: [описание переработки](./visual-refinement.md), [снимки](./gallery.md). Текущие браузерные проверки: 333 pass, 21 явный skip; матрица 322 сочетаний и PWA/runtime прошли.

Основная собранная версия: **http://localhost:5274/v2**. Кабинет: http://localhost:5274/v2/lk. Админка: http://localhost:5274/admin. Тестовые учётные данные сохранены отдельно, только локально: `/Users/macbook/alumni-staged-evidence/local-access.txt` (0600). Не переносить этот файл в git и не публиковать.

Для разработки тот же код: http://localhost:5273/v2. Исходный Docker-портал остаётся http://localhost; его контейнер может содержать более старую сборку. Скопированный исходный интерфейс в новом окружении: http://localhost:5274/. Kimi: http://127.0.0.1:5373. Никакая версия не публиковалась.

Рабочая папка `/Users/macbook/alumni-staged-refinement`, ветка `codex/alumni-staged-refinement`, базовый HEAD `d7c6eb11aee964331b23ab38ca68eb280a7c0078`. Коммит не создан, чтобы не включать унаследованную работу. Точная версия зафиксирована в `/Users/macbook/alumni-staged-evidence/final-change-manifest.json`. `/Users/macbook/alumni-staged-evidence/own-changes.patch` содержит изменения относительно сохранённого исходника, а не относительно чистого HEAD. Обычный git diff HEAD включает также унаследованные изменения.

## Повторный запуск сохранённого стенда

Открыть Docker Desktop. Команды выполняются из `/Users/macbook/alumni-staged-refinement`. Секреты читает wrapper из внешнего local.env; команды не печатают значения.

```sh
docker compose --env-file /Users/macbook/alumni-staged-evidence/local.env -f /Users/macbook/alumni-staged-evidence/compose.yaml up -d
pnpm install --frozen-lockfile --ignore-scripts
pnpm -C packages/shared build
pnpm -C apps/api build
docker compose --env-file /Users/macbook/alumni-staged-evidence/local.env -f /Users/macbook/alumni-staged-evidence/compose.yaml exec -T postgres psql -U alumni_staged -d alumni_staged < apps/api/migrations/20260908-checkout.sql
docker compose --env-file /Users/macbook/alumni-staged-evidence/local.env -f /Users/macbook/alumni-staged-evidence/compose.yaml exec -T postgres psql -U alumni_staged -d alumni_staged < apps/api/migrations/20260908-support.sql
```

В отдельном терминале API (порт 3200):

```sh
node /Users/macbook/alumni-staged-evidence/run-local.cjs pnpm -C apps/api start
```

Сборка и запуск фронтенда (порт 5274):

```sh
VITE_DIRECTUS_URL=http://localhost:8255 VITE_SITE_URL=http://localhost:5274 VITE_LOCAL_REVIEW=true pnpm -C apps/web build
API_PROXY_TARGET=http://127.0.0.1:3200 pnpm -C apps/web preview --host 127.0.0.1 --port 5274 --strictPort
```

Если порты заняты уже запущенными процессами этого стенда, использовать работающий стенд или завершить именно его процесс в исходном терминале. Не останавливать исходный Docker-проект и не удалять тома.

Directus нового стенда: http://localhost:8255. Перехватчик почты Mailpit: http://localhost:8325. Письма не уходят настоящим адресатам. PostgreSQL 33317 и MySQL 33316 доступны только на loopback. Compose project: alumni-staged-comparison, отдельные тома.

При создании нового пустого стенда сначала выполнить bootstrap со схемой/тестовыми данными через wrapper (`pnpm --filter @club/scripts bootstrap`), затем SQL-миграцию. Существующие тома повторно засеивать не нужно. Установленные образы и зависимости не объявляются версионированным production-релизом; перед production закрепить digest образов и подготовить резервную копию.

Kimi запускается из `/Users/macbook/alumni-kimi-candidate/runtime`:

```sh
node /Users/macbook/alumni-staged-evidence/run-local.cjs npm run dev -- --host 127.0.0.1 --port 5373 --strictPort
```

Для сравнения кабинета B сохранён helper `local-session.ts`, открывающий подписанную локальную тестовую сессию на 5398. Это не проверка внешнего Kimi OAuth. Архив и распакованный источник не менялись; правка зеркала npm относится только к исследовательской копии.

## Повторная приёмка

Unit-наборы: `pnpm -C packages/shared test`, `pnpm -C apps/api test`. Реальная транзакционная проверка:

```sh
node /Users/macbook/alumni-staged-evidence/run-local.cjs env RUN_CHECKOUT_INTEGRATION=true pnpm -C apps/api exec vitest run src/lib/checkout.integration.test.ts
```

Последовательный браузерный прогон без автоматических повторов:

```sh
node /Users/macbook/alumni-staged-evidence/final-check.cjs
```

Этот набор создаёт синтетические заявки и меняет статус одной тестовой заявки. Он предназначен только для alumni_staged. Большую матрицу и полный e2e не запускать одновременно с одного IP: подтверждено срабатывание штатного rate limit. Лимиты приложения для прохождения тестов не ослаблялись.

Свидетельства: acceptance.md, defects.md, security-review.md, data-and-rollback.md и `/Users/macbook/alumni-staged-evidence/`. Тесты с фикстурами отдельно обозначены, они не доказывают внешнюю доставку или оплату.

## Ключевые экраны

- Главная: `/Users/macbook/alumni-staged-evidence/matrix/light-1440-0-viewport.png`, `light-390-0-viewport.png`.
- ДПО: `matrix/light-1440-1.png`, `matrix/light-390-1.png`; сравнение `screenshots/stage3-dpo-390.png`.
- Мерч: `matrix/light-1440-3-viewport.png`, `matrix/light-390-3-viewport.png`; выбор варианта `screenshots/stage3-merch-dialog-390.png`.
- Кабинет: `matrix/light-1440-13.png`, `matrix/light-390-13.png`; профиль `matrix/dark-390-16.png`.
- Событие: `screenshots/stage2-event-dialog-390.png`.
- Подкаст: `screenshots/podcast-local-playing.png`.
- Админка: `screenshots/admin-order-persisted.png`.
- Короткий экран: `stress/landscape-merch.png`; увеличенный текст и reflow в той же папке.

Новая система: HSE Slab/Sans, фирменный оранжевый и семантические темы, редакционная главная, обзорный мерч и компактный рабочий кабинет. От Kimi перенесены пользовательские результаты: фильтры, самостоятельные детали товара/события, разделы кабинета и состав заявки. Архитектура выбрана после реального сравнения, основания и альтернативы в architecture-decision.md.

Локальная готовность и production-готовность различаются: внешние ключи, реальные материалы, коммерческие/юридические условия, миграция реальных данных и устройства перечислены в defects.md. Production не проверен и не опубликован.

## Поддержка и маскот

Добавлена локальная поддержка: http://localhost:5274/v2/support, ответы – в разделе «Поддержка» админки. [Контракт и ограничения по персональным данным](./support-and-personal-data.md). Этот этап не подтверждает соответствие production 152-ФЗ: ожидаются сведения об операторе и инфраструктуре.
