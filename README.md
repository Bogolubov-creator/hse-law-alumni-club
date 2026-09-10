> **Версия 3 · Codex** – ветка `codex/v3`. [Состав версии и ограничения](VERSION.md).

# Клуб выпускников факультета права Вышки

Портал клуба выпускников: публичный сайт, личный кабинет с геймификацией, витрины ДПО и мерча,
заявки (без онлайн-оплаты) и админка учебного офиса.

> **Оплаты на сайте нет.** Корзина ведёт к заявке с контактами — её обрабатывает офис.
> **Канон:** ohra `#EC5A13`, hse-blue `#11296B`, grafit `#14181F`, kost `#FBF3E8`; шрифты Unbounded + Onest + Martian Mono.

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
Directus наружу не выставляется.

## Быстрый старт (локально)
```bash
cp .env.example .env
# Сгенерировать секреты:  openssl rand -hex 32  (DIRECTUS_KEY, DIRECTUS_SECRET, AUTH_SECRET)
#                          openssl rand -hex 24  (DIRECTUS_SERVICE_TOKEN)
# Поменять POSTGRES_PASSWORD, ADMIN_PASSWORD. E-mail — с валидным доменом (Directus отклоняет .local).
docker compose up -d --build
docker compose logs -f bootstrap   # дождаться "Bootstrap завершён"
```
> Если путь к репозиторию содержит не-ASCII символы, Docker BuildKit падает на сессионном ключе —
> собирайте через ASCII-симлинк: `ln -s "<repo>" ~/club-pravo-hse` и запускайте docker оттуда
> с `COMPOSE_BAKE=false`.

| Сервис | Локально |
|---|---|
| Сайт | http://localhost |
| API | http://localhost/api/health · /api/ready |
| Directus Studio (контент) | http://localhost:8055 |

**Тестовые аккаунты** (создаёт bootstrap): выпускник `alumni@club.example.com` / `alumni12345`,
офис `editor@club.example.com` / `editor12345`, админ Directus — из `.env`.

## Что реализовано (фазы)
- **0 · Фундамент** — монорепо, Directus+PG, идемпотентный bootstrap, стек в Docker.
- **1a · Главная** — `/` лендинг (сборка Фемиды, параллакс, маркиза, pinned-таймлайн) + живые новости.
- **1b · CMS-блоки** — тексты главной редактируются в Directus через Many-to-Any (`pages` → `pages_blocks`).
- **2 · ЛК + геймификация** — `points_ledger` (источник правды) → уровни/скидки/достижения, cron-decay −15%/мес;
  экраны `/lk` (дашборд) и `/lk/profile`. Auth выпускника — JWT-сессия apps/api.
- **3 · Витрины + заявка** — `/dpo`, `/dpo/:slug`, `/merch` (карточка модалкой), `/cart` → заявка (без оплаты),
  скидка выпускника справочно, уведомление офиса (Telegram/лог).
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
pnpm -r test    # 155 юнитов: shared 46 + api 109
```
- **shared** — уровни, скидка, decay, достижения, переоценка корзины.
- **api, чистые библиотеки** — Telegram initData, идемпотентность платежа, анти-брутфорс, подсети ЮKassa.
- **api, роуты** (`src/routes/*.test.ts`) — вход и регистрация с подтверждением почты, сброс пароля,
  гарды админки, оформление заявки (переоценка по каталогу, остатки, скидка), вебхук ЮKassa
  (подсети, сверка статуса через API, идемпотентность). Directus подменяется хранилищем в
  памяти (`src/test/`), сеть не нужна.

E2E (Playwright, против живого стека) — см. [docs/deploy-runbook.md](docs/deploy-runbook.md) §3.1.

## Деплой на VPS
Тот же `docker compose up -d --build`. В `.env` поменять домены (`WEB_DOMAIN`, `ADMIN_DOMAIN`,
`DIRECTUS_PUBLIC_URL`, `ACME_EMAIL`) — Caddy сам возьмёт TLS. Directus/API публикуются только на 127.0.0.1.

## Требует реальных секретов (BLOCKED)
- `OFFICE_TG_BOT_TOKEN` + `OFFICE_TG_CHAT_ID` — уведомление офиса о заявке (без них заявка создаётся, шлётся лог).
- `SMTP_*` — письмо-подтверждение заявителю.
- `TELEGRAM_BOT_TOKEN` — живой вход через Telegram Mini App (валидация подписи уже покрыта тестами).

## Дальше (Фаза 6, требует деплоя)
Lighthouse ≥90 на проде, финальный a11y-проход, мониторинг/бэкапы. Прогресс — в `WORKLOG.md`.
