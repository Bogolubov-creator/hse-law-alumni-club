> **Версия 3** – [состав версии и ограничения](VERSION.md).

# Клуб выпускников факультета права Вышки

Портал клуба выпускников: публичный сайт, личный кабинет с геймификацией, витрины ДПО и мерча,
заявки с опциональной онлайн-оплатой и админка учебного офиса.

> **По умолчанию оплата выключена.** Без ключей ЮKassa корзина создаёт заявку для офиса.
> **Канон:** охра `#EC5A13`, синий `#11296B`, графит `#14181F`, светлый фон `#FBF3E8`; шрифты HSE Sans + HSE Slab.

## Архитектура
```
apps/web        Vite + React + TS + Tailwind (SPA: сайт, ЛК, витрины, корзина, админка)
apps/api        Fastify + TS + zod (геймификация, корзина/заявки, auth-сессии, админ-операции, cron-decay)
packages/shared zod-схемы, константы геймификации, сиды (единый источник)
scripts         идемпотентный directus-bootstrap (схема, M2A, роли, сиды, сервисный токен)
infra           Caddyfile (один на локаль и VPS)
docs            directus-schema.md — схема данных
docker-compose.yml  postgres · directus · api · web · caddy · bootstrap
```
**Directus + PostgreSQL** — бэкенд правды, админка контента, авторизация. **apps/api** — бизнес-логика,
которой нет в CMS, и единственная точка, через которую фронт читает данные (`/api/*`, same-origin).
Directus доступен через Caddy на домене админки; порт API на хосте не публикуется.

## Быстрый старт (локально)
На macOS нужен Docker Desktop; устанавливать Ubuntu на Mac для этого проекта не нужно.
Для публичного сайта позже потребуется отдельный сервер с Ubuntu, домен и DNS – см.
[runbook](docs/deploy-runbook.md). Локальный Docker-стек не является публичным продакшеном.

```bash
cp .env.example .env
# Сгенерировать секреты:  openssl rand -hex 32  (DIRECTUS_KEY, DIRECTUS_SECRET, AUTH_SECRET)
#                          openssl rand -hex 24  (DIRECTUS_SERVICE_TOKEN)
# Поменять POSTGRES_PASSWORD, ADMIN_PASSWORD и пароль в CHECKOUT_DATABASE_URL.
# E-mail — с валидным доменом (Directus отклоняет .local).
docker compose up -d --build
docker compose logs -f bootstrap   # дождаться "Bootstrap завершён"
./scripts/apply-indexes.sh          # SQL-миграции и индексы после bootstrap
```
> Если путь к репозиторию содержит не-ASCII символы, Docker BuildKit падает на сессионном ключе —
> собирайте через ASCII-симлинк: `ln -s "<repo>" ~/club-pravo-hse` и запускайте docker оттуда
> с `COMPOSE_BAKE=false`.

| Сервис | Локально |
|---|---|
| Сайт | http://localhost |
| API | http://localhost/api/health · /api/ready |
| Directus Studio (контент) | http://localhost:8055 |

**Тестовые аккаунты** создаются только при `SEED_DEMO=true` в локальном `.env`:
выпускник `alumni@club.example.com` / `alumni12345`, офис `editor@club.example.com` /
`editor12345`. На публичном сервере оставьте `SEED_DEMO=false`.

## Что реализовано (фазы)
- **0 · Фундамент** — монорепо, Directus+PG, идемпотентный bootstrap, стек в Docker.
- **1a · Главная** — `/` лендинг (сборка Фемиды, параллакс, маркиза, pinned-таймлайн) + живые новости.
- **1b · CMS-блоки** — тексты главной редактируются в Directus через Many-to-Any (`pages` → `pages_blocks`).
- **2 · ЛК + геймификация** — `points_ledger` (источник правды) → уровни/скидки/достижения, cron-decay −15%/мес;
  экраны `/lk` (дашборд) и `/lk/profile`. Auth выпускника — JWT-сессия apps/api.
- **3 · Витрины + заявка** — `/dpo`, `/dpo/:slug`, `/merch` (карточка модалкой), `/cart` → заявка,
  скидка выпускника справочно, уведомление офиса через выбранный канал.
- **4 · Админка офиса** — `/admin`: верификация, ручные баллы, персональные скидки, статусы заявок;
  контент — в Directus Studio.
- **5 · mini-app (ядро)** — валидация Telegram `initData` (тесты), рефералка `+80` рефереру.

## Маршруты
`/` · `/news` · `/news/:slug` · `/dpo` · `/dpo/:slug` · `/merch` · `/cart` · `/lk` · `/lk/profile` · `/admin/*`

## Ключевые эндпоинты `/api`
- Контент: `GET /news`, `/news/:slug`, `/pages/:slug`, `/programs`, `/programs/:slug`, `/products`
- ЛК: `POST /auth/login`, `GET /me`, `/me/level`, `/me/ledger`, `/me/orders`, `PATCH /me/profile`
- Корзина/заявки: `GET/POST/PATCH/DELETE /cart`, `POST /orders`
- Геймификация: `POST /points`, `POST /decay/run` (сервисный токен)
- Админ: `POST /auth/admin-login`, `GET /admin/overview|orders|members`, `PATCH /admin/orders/:id`,
  `PATCH /admin/members/:id`, `POST /admin/members/:id/points`
- Mini-app: `POST /auth/telegram` (503 без `TELEGRAM_BOT_TOKEN`)

## Тесты
```bash
pnpm -r test    # тесты shared, web и api; точное число зависит от версии
```
- **shared** — уровни, скидка, decay, достижения, переоценка корзины.
- **api, чистые библиотеки** — Telegram initData, идемпотентность платежа, анти-брутфорс, подсети ЮKassa.
- **api, роуты** (`src/routes/*.test.ts`) — вход и регистрация с подтверждением почты, сброс пароля,
  гарды админки, оформление заявки (переоценка по каталогу, остатки, скидка), вебхук ЮKassa
  (подсети, сверка статуса через API, идемпотентность). Directus подменяется хранилищем в
  памяти (`src/test/`), сеть не нужна.

E2E (Playwright, против живого стека) — см. [docs/deploy-runbook.md](docs/deploy-runbook.md) §3.1.

## Деплой на VPS
Инструкция по первому запуску, миграции, проверке и откату – в
[runbook](docs/deploy-runbook.md). На сервере нужны реальные домены, SMTP и секреты;
Caddy получает TLS. API доступен только внутри Compose, Directus открыт с хоста на
`127.0.0.1:8055` и через домен админки.

## Требует реальных секретов (BLOCKED)
- `OFFICE_TG_BOT_TOKEN` + `OFFICE_TG_CHAT_ID` – если офис получает уведомления в Telegram;
  для канала `email` нужны `OFFICE_EMAIL` и работающий SMTP.
- `SMTP_*` — письмо-подтверждение заявителю; обязательно для публичного запуска.
- `TELEGRAM_BOT_TOKEN` — живой вход через Telegram Mini App (валидация подписи уже покрыта тестами).
- `YOOKASSA_*` — онлайн-оплата, если она нужна для первого выпуска.

## Дальше (Фаза 6, требует деплоя)
Lighthouse ≥90 на проде, финальный a11y-проход, мониторинг/бэкапы. Прогресс — в `WORKLOG.md`.
