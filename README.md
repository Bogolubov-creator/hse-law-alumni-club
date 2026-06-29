# Клуб выпускников факультета права НИУ ВШЭ

Монорепо портала клуба. **Оплаты нет** — заказ это заявка с контактами, которую учебный офис обрабатывает вручную.

## Состав
```
apps/web        Vite + React + TS + Tailwind (фронт; экраны — Claude Design)
apps/api        Fastify + TS + zod (корзина, заявки, геймификация, decay — по фазам)
packages/shared zod-схемы, константы геймификации, сиды (единый источник для api/web/scripts)
scripts         идемпотентный directus-bootstrap (схема, роли, сиды, сервисный токен)
infra           Caddyfile (один на локаль и VPS)
docs            directus-schema.md — схема данных (источник правды)
docker-compose.yml  postgres · directus · api · web · caddy · bootstrap
```

Стек правды и админка — **Directus + PostgreSQL**. Кастомная логика — **apps/api**. Деплой — docker-compose (локально и на VPS одинаково, различие только в `.env`).

## Быстрый старт (локально)
```bash
cp .env.example .env
# Сгенерируйте секреты и впишите в .env:
#   openssl rand -hex 32   # DIRECTUS_KEY
#   openssl rand -hex 32   # DIRECTUS_SECRET
#   openssl rand -hex 24   # DIRECTUS_SERVICE_TOKEN
# Поменяйте POSTGRES_PASSWORD и ADMIN_PASSWORD.

docker compose up -d --build
docker compose logs -f bootstrap     # дождитесь "Bootstrap завершён"
```

Адреса локально:
| Сервис | URL |
|---|---|
| Сайт (web через Caddy) | http://localhost |
| API через Caddy | http://localhost/api/health, http://localhost/api/ready |
| Directus (админка) | http://localhost:8055 |
| Directus (через Caddy) | http://localhost:8081 |

Вход в админку: `ADMIN_EMAIL` / `ADMIN_PASSWORD` из `.env`.
Тестовые аккаунты (создаёт bootstrap): `editor@club.example.com` / `editor12345`, `alumni@club.example.com` / `alumni12345`.
(E-mail должны быть с валидным доменом — Directus отклоняет `.local`.)

## Разработка без Docker
```bash
pnpm install
pnpm --filter @club/shared build
# Directus поднимите через docker compose (postgres+directus), затем:
DIRECTUS_URL=http://localhost:8055 ADMIN_EMAIL=... ADMIN_PASSWORD=... \
DIRECTUS_SERVICE_TOKEN=... TEST_EDITOR_EMAIL=... TEST_EDITOR_PASSWORD=... \
TEST_ALUMNI_EMAIL=... TEST_ALUMNI_PASSWORD=... pnpm bootstrap
pnpm dev:api    # http://localhost:3000
pnpm dev:web    # http://localhost:5173 (проксирует /api на :3000)
```

## Деплой на VPS
Тот же `docker compose up -d --build`. В `.env` поменять только домены:
```
WEB_DOMAIN=club.example.ru
ADMIN_DOMAIN=admin.club.example.ru
DIRECTUS_PUBLIC_URL=https://admin.club.example.ru
ACME_EMAIL=you@example.ru
```
Caddy сам выпустит TLS. Порты Directus/API публикуются только на 127.0.0.1 — наружу доступ через Caddy.

## Критерий приёмки Фазы 0
1. `docker compose up` поднимает стек (postgres, directus, api, web, caddy).
2. Админка Directus открывается (http://localhost:8055).
3. `bootstrap` создаёт схему, роли, сиды (levels, point_rules, achievements, programs), сервисный токен и тестовые аккаунты — повторный запуск не дублирует.
4. `curl http://localhost/api/health` → `{"status":"ok"}`.
5. `curl http://localhost/api/ready` → `directus.ok=true`, `levelsSeeded=4` (api видит Directus сервисным токеном).

## Дальше
Фаза 1 — страницы через Directus M2A + новостная лента. Фазы и решения — в `docs/` и оркестрационных документах.
