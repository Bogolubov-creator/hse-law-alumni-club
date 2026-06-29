# WORKLOG

Автономная работа Claude Code по проекту «Клуб выпускников факультета права Вышки».

## Статус фаз
| Фаза | Статус | Коммит | Приёмка | Заметки |
|---|---|---|---|---|
| 0 · Фундамент | done | baseline | ✓ | монорепо, Directus+PG, bootstrap, стек поднят |
| H · Админка (порт дизайна) | done | baseline | ✓ | `apps/web/src/admin/AdminApp.tsx`, мок-данные |
| 1a · Главная + живые новости | done | feat(web): Фаза 1a | ✓ | порт Главной, /api/news, сид новостей |
| 1b · M2A-блоки Главной | done | feat: Фаза 1b | ✓ | block_hero/block_cta, pages_blocks (M2A) |
| 2 · ЛК + геймификация | движок done; ЛК-UI todo | feat(api): Фаза 2 движок | ✓ (движок) | engine+тесты зелёные; UI/auth – след. шаг |
| 3 · Витрины + заявка | todo | – | – | – |
| 4 · Админка на реальных данных | todo | – | – | – |
| 5 · mini-app | todo (часть BLOCKED) | – | – | нужны боевые токены |
| 6 · Полировка | todo | – | – | – |

## Лог
- 2026-06-29 Фаза 1a (в работе): добавлены `react-router-dom` + `@tanstack/react-query`;
  `main.tsx` обёрнут в Router + QueryProvider; роуты `/`, `/news`, `/news/:slug`, `/admin/*`
  (админка перенесена с хэша на путь), заглушки `/lk /dpo /merch /cart /checkout`.
  `apps/api`: эндпоинты `GET /news`, `/news/:slug`, `/pages/:slug` (zod, сервисный токен).
  `packages/shared`: `NEWS_SEED` (3 новости, тексты из дизайна). Bootstrap сидит новости идемпотентно.
  `Home.tsx` – порт «Главная.dc.html» (сборка Фемиды, параллакс, маркиза, pinned-таймлайн, reveal,
  count-up, магнитные CTA), новости живьём из `/api/news`. `News.tsx` + `NewsPost.tsx`.
  Канон-токены применены (ohra #EC5A13, Onest, Martian Mono).
  Самопроверка: shared/api/web build чисто, scripts typecheck чисто, сид новостей +3 (идемпотентно).
  Стек поднят: /api/health ok, /api/news отдаёт 3 новости, /api/news/:slug ok. Визуально проверены
  Главная (сборка Фемиды + секции), /news и /news/:slug – рендер на канон-токенах, живые данные.
  Консоль: только future-flag предупреждения React Router (включил v7-флаги). Lint в репо не настроен
  (отметка); юнит-тестов в 1a нет – движков нет, тесты появятся в Фазе 2.

- 2026-06-29 Фаза 1b (done): Directus M2A для страниц – коллекции `block_hero`, `block_cta`,
  junction `pages_blocks` (alias `pages.blocks`, relations m2o→pages + m2a→any). Сид страницы `home`
  с блоками hero+cta. `apps/api` `GET /pages/:slug` резолвит блоки в `{ hero, cta }`.
  `Home.tsx` берёт badge/title/subtitle/CTA-тексты из CMS с фоллбэком на дефолты в коде.
  Самопроверка: api/web build чисто, scripts typecheck чисто; bootstrap M2A прогнан локально без ошибок
  (идемпотентен). Доказана редактируемость: PATCH `block_hero.title_accent` в Directus → `/api/pages/home`
  → H1 на Главной обновился без участия разработчика (затем откатил к сид-значению).

- 2026-06-29 Фаза 2 — движок геймификации (done): `packages/shared` – `decayDelta`, `evaluateAchievements`
  + 10 юнит-тестов (vitest): уровни, потолок скидки 25%, decay −15% с понижением уровня, «Знаток» на 3-й
  программе. `apps/api/lib/engine.ts` – `addPoints` (ledger = источник правды) → `recompute`
  (points_cached/level_cached агрегатом) → `grantAchievements`; `runDecay` (idempotent по месяцу).
  `apps/api/lib/auth.ts` – `resolveAlumni` (Directus user-токен), `isServiceToken`. Эндпоинты:
  `POST /points` (сервисный токен), `POST /decay/run`, `GET /me/level`, `GET /me/ledger`
  (гейт: 403 до верификации). Cron-decay – node-cron, 1-го числа месяца 03:00.
  Интеграционно проверено на тест-выпускнике: 3×program → graduate→friend + achievements
  [first_step, expert3]; идемпотентность (1 строка на ключ); +2 → 560 = expert; decay 560→476 (−15%,
  expert→friend «просел»), 2-й прогон того же месяца без изменений; `/me/*` без валидного токена → 401.
  Самопроверка: shared test 10/10, api/web build чисто, scripts typecheck чисто, стек /health 200.

## BLOCKED: нужен я
- (пока нет — но см. «Как возобновить»: для happy-path `/me/*` нужны политики роли `alumni` в Directus)

## Как возобновить
- Последний зелёный коммит: `feat(api): Фаза 2 — движок геймификации`.
- **Следующий шаг — Фаза 2-UI (ЛК):**
  1. Directus: политики роли `alumni` (read own `directus_users`, own `alumni`, own `points_ledger`,
     own `alumni_achievements`) + app-доступ – чтобы `GET /me/*` работал по токену выпускника.
     Добавить в `directus-bootstrap` (идемпотентно, как и остальное).
  2. `apps/web`: логин выпускника через Directus (`/auth/login`), хранение токена; клиент `/api` шлёт
     `Authorization: Bearer`. Гейт ЛК (как в дизайне B – экран входа).
  3. Порт `Дашборд ЛК.dc.html` (B) → `src/pages/Lk.tsx` и `Профиль.dc.html` (C) → `src/pages/Profile.tsx`,
     подключить к `GET /me/level`, `/me/ledger`, достижениям. Канон-токены.
  4. Приёмка Фазы 2: начисление меняет уровень/скидку в ЛК; decay понижает; «Знаток» на 3-й программе;
     ЛК активен только после верификации.
- Затем Фазы 3 → 4 → 5 → 6 по плану. Docker: команды через ASCII-симлинк `/Users/macbook/club-pravo-hse`
  + `COMPOSE_BAKE=false` (кириллица в пути ломает BuildKit). Сид/bootstrap идемпотентны.
- Тест-выпускник после прогона движка: points 476, level friend (был сид 420). При желании сбросить –
  пересоздать через bootstrap на чистом volume.
