# Прод-runbook — Клуб выпускников факультета права НИУ ВШЭ

Оперативная инструкция для оператора VPS: деплой, обновление, откат, восстановление,
ротация секретов, мониторинг, инциденты. Все команды — от пользователя с доступом к `docker`.

## Архитектура (кратко)

Один VPS, один инстанс API. Docker Compose: `postgres` (16) → `directus` (11, CMS/схема) →
`bootstrap` (одноразовый идемпотентный сид) → `api` (Fastify) + `web` (SPA за Caddy) →
`caddy` (внешний TLS-прокси). Postgres — только во внутренней сети (не публикуется).
Cron-задачи (decay, dpo-sync, напоминания, ретенция ПДн) выполняются **внутри процесса API**.

> **Ограничение single-instance.** Cron и стор rate-limit/лока входа — в памяти процесса.
> **Нельзя** масштабировать API в несколько реплик без распределённого лока (advisory-lock
> Postgres / Redis) и общего стора — иначе задвоятся напоминания/начисления, а лимиты
> перестанут действовать (см. `apps/api/src/lib/mutex.ts`, `lib/security.ts`, `server.ts`).

## 1. Предпосылки перед прод-запуском

Заполнить `.env` из `.env.example` и обязательно:

- Сгенерировать секреты: `POSTGRES_PASSWORD`, `DIRECTUS_KEY`, `DIRECTUS_SECRET`,
  `DIRECTUS_SERVICE_TOKEN`, `AUTH_SECRET` (≥32), `ADMIN_AUTH_SECRET` (отдельный), `ADMIN_PASSWORD`,
  `BACKUP_ENCRYPTION_KEY` — каждый через `openssl rand -hex 32`.
- `APP_ENV=production` — включает **fail-fast**. API не стартует, если: секреты выглядят
  плейсхолдерами; `PUBLIC_URL` не `https://`; пуст `ADMIN_AUTH_SECRET`; бот на webhook без
  секрета; **пуст `SMTP_HOST`**; SMTP задан без отправителя; **`SEED_DEMO=true`**.
  Проверки покрыты тестами (`apps/api/src/env.test.ts`) — каждая ветка отдельно.
- Реальные `WEB_DOMAIN`/`ADMIN_DOMAIN`, валидный `ACME_EMAIL` (не `.local` — Let's Encrypt отклонит),
  `PUBLIC_URL=https://<домен>`, `DIRECTUS_PUBLIC_URL=https://admin.<домен>`,
  `DIRECTUS_CORS_ORIGIN=https://admin.<домен>` (не `true`).
- `SEED_DEMO=false` — одним флагом закрываются и демо-контент витрин, и тестовые аккаунты
  (`TEST_EDITOR_*`, `TEST_ALUMNI_*`); иначе editor со слабым паролем станет бэкдором.
- **`SMTP_*` обязателен**, а не опционален: без почтового канала не работают восстановление
  пароля (`/auth/forgot` честно отвечает 503) и подтверждение адреса при регистрации.
- Завести сотрудникам офиса **личные** аккаунты Directus с ролью `editor` (см. §1.1), а не
  выдавать общий Administrator.
- Опционально: `TELEGRAM_*`, `OFFICE_TG_*`, `YOOKASSA_*`, `VAPID_*` (пусто = пуши выключены),
  `SENTRY_DSN`, `BACKUP_OFFSITE_REMOTE` (rclone-remote для offsite-бэкапа в РФ).

> **Важно про web.** `PUBLIC_URL` и `DIRECTUS_PUBLIC_URL` инлайнятся в SPA-бандл **на сборке**
> (build-args `VITE_SITE_URL`/`VITE_DIRECTUS_URL`). При смене доменов web нужно **пересобрать**.

Организационные шаги 152-ФЗ (РКН, локализация в РФ, ответственный, DPA с ЮKassa) — см.
[152fz-compliance.md](152fz-compliance.md).

## 1.1. Доступы и роли

Bootstrap создаёт две политики (Directus 11, идемпотентно):

| Кто | Роль / политика | Что может |
|---|---|---|
| Сотрудник офиса | `editor` → «Офис (контент)» | вход в Studio, CRUD контента (страницы, новости, программы, товары, события, подкасты, таймлайн, файлы) |
| `apps/api` | `service` → «Сервис (apps/api)» | данные приложения + `directus_users`/`directus_files`/`directus_roles`; **без** доступа к схеме, настройкам и расширениям |
| Владелец | `Administrator` | всё, включая схему — только для миграций и разбора инцидентов |

Что это даёт: `alumni`, `orders`, `points_ledger`, `audit_log` и корзины **недоступны редактору** —
персональные данные и заявки офис ведёт в админ-панели сайта (`/admin`), где каждое действие
попадает в аудит. Утечка `DIRECTUS_SERVICE_TOKEN` больше не даёт захватить инсталляцию: сменить
схему, создать администратора или прочитать настройки этим токеном нельзя.

Заведение сотрудника: Studio → *User Directory* → создать пользователя, роль `editor`,
включить 2FA. Общий аккаунт Administrator для повседневной работы использовать не нужно —
иначе в аудите не видно, кто именно что сделал.

> Обновляетесь со старой версии, где офис работал под Administrator? После
> `docker compose up -d --build` **перезапустите `bootstrap`** — политики создадутся, роль
> сервисного аккаунта понизится сама. Затем переведите сотрудников на личные `editor`-аккаунты.

## 1.2. Подтверждение почты при регистрации

Заданный `SMTP_HOST` включает подтверждение: аккаунт создаётся со статусом `unverified`,
войти нельзя, пока человек не откроет ссылку из письма (24 часа, `/confirm?token=…`).
Офис получает уведомление о заявке **после** подтверждения — очередь верификации не забивается
заявками с чужих и несуществующих адресов. Без SMTP поведение прежнее (аккаунт активен сразу),
иначе на стенде без почты зарегистрироваться было бы невозможно. **На проде режим «без SMTP»
недостижим:** `APP_ENV=production` с пустым `SMTP_HOST` прерывает старт, поэтому подтверждение
почты на боевом стенде включено всегда.

## 2. Первичный деплой

```bash
git clone https://github.com/Bogolubov-creator/hse-law-alumni-club.git club-pravo-hse
cd club-pravo-hse
cp .env.example .env      # затем заполнить (см. §1)
docker compose up -d --build
docker compose logs -f bootstrap   # дождаться «Bootstrap завершён», Ctrl+C
./scripts/apply-indexes.sh          # индексы БД под масштаб
```

Установить cron из `infra/cron.example` (`crontab -e`): бэкап 03:30, проверка бэкапа Пн 04:00,
uptime каждые 5 мин. Проверить: `curl -fsS https://<домен>/api/health` → `{"status":"ok"}`.

## 3. Обновление / редеплой

```bash
git pull
docker compose up -d --build       # пересобирает изменённые образы
./scripts/apply-indexes.sh          # идемпотентно; на случай новых индексов
```

SIGTERM обрабатывается gracefully (cron останавливается, активные запросы дозавершаются,
`stop_grace_period: 30s`). Если менялись домены/`PUBLIC_URL` — web пересоберётся сам (build-args).

## 3.1. E2E-проверка перед релизом (Playwright)

Набор гоняется против **живого** стека (локального или staging) — в CI его нет,
там нет БД/API. Прогонять после деплоя перед тем, как объявить релиз:

```bash
pnpm --filter @club/web e2e
```

Другой хост: `E2E_BASE_URL=https://<домен> pnpm --filter @club/web e2e`.
Первый запуск на новой машине: `npx playwright install chromium`.
Покрыто (24 проверки, десктоп + iPhone): публичные витрины, юр-страницы, robots/sitemap,
`noindex` приватных разделов и 404, мобильная оболочка (табы, карточка программы, мерч
с размерами, плеер, пустая корзина) и то, что десктоп **не** получает мобильную оболочку.
Набор **read-only**: заявки не отправляются, данные стенда не меняются.

## 4. Откат

- **Код:** `git revert <sha>` (или `git checkout <прежний-tag>`), затем `docker compose up -d --build`.
- **Быстрый откат сервиса:** держать предыдущий образ; `docker compose up -d` на нём.
- **Данные:** если проблема повредила БД — восстановить из бэкапа (§5). Схема Directus и сиды
  идемпотентны — повторный `bootstrap` безопасен.

## 5. Восстановление из бэкапа

Бэкапы — AES-256 (`scripts/backup-db.sh`), восстановимость проверяется еженедельно
(`scripts/backup-verify.sh`). Ручное восстановление:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
  -in backups/club-YYYY-MM-DD-HHMM.sql.gz.enc | gunzip \
  | docker compose exec -T postgres psql -U club -d club
```

Ключ `BACKUP_ENCRYPTION_KEY` хранить **отдельно** от бэкапов. Offsite-копия — при заданном
`BACKUP_OFFSITE_REMOTE` делается автоматически в конце `backup-db.sh`.

## 6. Ротация секретов

- **`AUTH_SECRET` / `ADMIN_AUTH_SECRET`:** заменить в `.env`, `docker compose up -d api`.
  Все текущие сессии ЛК/админки станут недействительны (потребуется повторный вход) — это ожидаемо.
- **`DIRECTUS_SERVICE_TOKEN`:** пересоздать токен сервис-аккаунта в Directus Studio, обновить `.env`,
  перезапустить `api` и `bootstrap`.
- **Компрометация аккаунта выпускника:** сброс пароля бампает `token_version` — старые токены
  этого пользователя отзываются немедленно (`lib/auth.ts`). Массовый отзыв — сменой `AUTH_SECRET`.
- **`POSTGRES_PASSWORD`:** сменить в Postgres и `.env` согласованно (иначе Directus не подключится).
- **Пароль сервисного аккаунта** (`service@club.example.com`) задаётся bootstrap'ом случайным и
  нигде не хранится: машине он не нужен, `apps/api` ходит статическим токеном. Раньше сюда клали
  сам `DIRECTUS_SERVICE_TOKEN`, и его утечка давала вход в публичную Studio полным админом.
  При обновлении со старой версии **обязательно перезапустите `bootstrap`** — иначе прежний
  пароль (равный токену) останется рабочим.

## 6.1. Зависимости и уязвимости

- CI гоняет `pnpm audit --prod --audit-level high` — сборка падает на high/critical.
- Транзитивные фиксы, которые не приходят обновлением родителя, зафиксированы в
  `pnpm.overrides` корневого `package.json` (`fast-uri`, `find-my-way`, `uuid`). При обновлении
  fastify/node-cron проверьте, не стали ли оверрайды лишними — снимайте, когда родитель
  подтянет патч сам.
- Dependabot (`.github/dependabot.yml`) — еженедельные PR на npm и GitHub Actions.
- **Исключение в аудите** — `pnpm.auditConfig.ignoreGhsas` в корневом `package.json`:
  `GHSA-qwww-vcr4-c8h2` (React Router, CSRF в режиме RSC). Уязвимость закрыта только в
  React Router 8, который требует React 19, а сайт на React 18. К нам она не относится:
  RSC-режим и серверные экшены не используются — это обычный SPA на `BrowserRouter`.
  **Снять исключение** при переезде на React 19 + React Router 8. Учтите: `pnpm audit`
  всё равно печатает эту запись в отчёте, но код возврата с `--audit-level high` уже нулевой.

## 7. Мониторинг

- **Healthchecks:** у всех сервисов в compose (`docker compose ps` показывает healthy/unhealthy).
  `/api/health` — liveness, `/api/ready` — связь с Directus.
- **Uptime:** `scripts/uptime-check.sh` (host-cron) шлёт алерт в офисный TG при падении/восстановлении.
- **Ошибки:** Sentry при заданном `SENTRY_DSN` (ПДн вычищаются в `beforeSend`).
- **Логи:** json-file с ротацией (`max-size 10m`, `max-file 3`) — диск не забьётся.
- **Рекомендация:** добавить **внешний** аптайм-пробник (UptimeRobot/Healthchecks.io) — host-cron
  не сообщит, если сам VPS недоступен.

## 8. Инциденты

- **API не стартует после деплоя:** `docker compose logs api` — при `APP_ENV=production` в начале
  печатаются причины fail-fast (`[prod-config] …`). Исправить `.env`, перезапустить.
- **Directus/БД недоступны:** `/api/ready` → 503; проверить `docker compose ps`, логи postgres/directus.
- **Компрометация:** сменить `AUTH_SECRET` (отзыв всех сессий) и `DIRECTUS_SERVICE_TOKEN`,
  проверить `GET /api/admin/audit`, при необходимости восстановить БД из чистого бэкапа.
- **Наплыв/DoS:** per-IP rate-limit + per-route лимиты активны; при необходимости ужесточить
  лимиты Caddy/`server.ts` и увеличить ресурсы (`mem_limit`).

## Связанные документы

- [152fz-compliance.md](152fz-compliance.md) — 152-ФЗ: что в коде, что делает оператор.
- [seo-plan.md](seo-plan.md) — SEO-план и мета-разметка.
- `.env.example` — все переменные окружения с комментариями.
