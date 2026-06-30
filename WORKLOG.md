# WORKLOG

Автономная работа Claude Code по проекту «Клуб выпускников факультета права Вышки».

## Статус фаз
| Фаза | Статус | Коммит | Приёмка | Заметки |
|---|---|---|---|---|
| 0 · Фундамент | done | baseline | ✓ | монорепо, Directus+PG, bootstrap, стек поднят |
| H · Админка (порт дизайна) | done | baseline | ✓ | `apps/web/src/admin/AdminApp.tsx`, мок-данные |
| 1a · Главная + живые новости | done | feat(web): Фаза 1a | ✓ | порт Главной, /api/news, сид новостей |
| 1b · M2A-блоки Главной | done | feat: Фаза 1b | ✓ | block_hero/block_cta, pages_blocks (M2A) |
| 2 · ЛК + геймификация | done | feat: Фаза 2 (движок+ЛК+профиль) | ✓ | движок+тесты, auth, Дашборд B, Профиль C |
| 3 · Витрины + заявка | done | feat: Фаза 3 | ✓ | витрины D/E/F, корзина+заявка G, без оплаты |
| 4 · Админка на реальных данных | done | feat: Фаза 4 | ✓ | admin-auth, верификация/баллы/скидки/заявки |
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

- 2026-06-29 Фаза 2-UI (done): auth-сессия apps/api без политик Directus – `POST /auth/login` (креды
  валидирует Directus, JWT с `alumni_id` подписывает apps/api, `AUTH_SECRET`). `resolveAlumni` по нашему
  JWT. `GET /me` (профиль+уровень+достижения+активность за 6 мес), `GET /me/ledger`, `PATCH /me/profile`
  (ФИО+контакты). `apps/web`: экран входа + порт **Дашборд ЛК (B)** `Lk.tsx` (кольцо уровня, скидка,
  бар-чарт активности, бейджи, модалка) и **Профиль (C)** `Profile.tsx` (контакты с сохранением,
  история баллов, правила достижений). Роуты `/lk`, `/lk/profile`. Гейт «ожидает верификации».
  Проверено визуально: вход alumni@club.example.com → дашборд с реальными данными (Друг клуба, −10%,
  «3 из 5», Знаток открыт), уровень/скидка отражают состояние движка.

- 2026-06-29 Фаза 3 (done): `apps/api` – `GET /programs`, `/programs/:slug`, `/products`; корзина
  `GET/POST/PATCH/DELETE /cart` (сессия по заголовку `x-cart-session`); `POST /orders` (контакты,
  способ получения, согласие ПДн, `member_discount` справочно по уровню вошедшего выпускника, статус
  `new`, номер `ALU-2026-NNNNNN`, очистка корзины); `GET /me/orders`; `lib/notify` – Telegram офису
  (если есть токен) иначе лог + BLOCKED-пометка (заявка всё равно создаётся). Глобальный error-handler:
  zod → 400. `apps/web` – `SiteShell` (шапка с корзиной), витрины **D** (`Dpo.tsx`, фильтры
  направление/формат), **E** (`Program.tsx`), **F** (`Merch.tsx`, карточка товара модалкой + варианты),
  **G** (`Cart.tsx`, корзина + checkout + экран «Заявка принята» с номером). Скидка выпускника – бейдж −%.
  Проверено: каталоги 6/3, корзина (subtotal), заявка alumni ALU-...001 (−10% → total) + guest ...003,
  consent omitted → 400, cart очищается, `/me/orders` показывает заявку, офис-уведомление blocked без
  токена. Визуально D/F/G на канон-токенах, адаптив, заявка проходит end-to-end. Сид мерча +3 идемпотентно.

## BLOCKED: нужен я
- **Telegram-уведомление офиса**: нужны боевые `OFFICE_TG_BOT_TOKEN` + `OFFICE_TG_CHAT_ID` (создать
  бота у @BotFather, добавить в чат офиса, взять chat_id). Код готов: при наличии токенов офис получает
  уведомление о новой заявке; без них заявка создаётся, но шлётся только лог (`[notify:BLOCKED]`).
  Вписать в `.env` и перезапустить api. Аналогично `SMTP_*` для письма-подтверждения заявителю.

- 2026-06-30 Фаза 4 (done): admin-сессия — `POST /auth/admin-login` (роли editor/admin/Administrator,
  JWT scope=admin), `resolveAdmin`. Эндпоинты `apps/api/routes/admin.ts`: `GET /admin/overview`,
  `GET /admin/orders` + `PATCH /admin/orders/:id` (статус), `GET /admin/members` +
  `PATCH /admin/members/:id` (verification_status / personal_discount 0–10) + `POST /admin/members/:id/points`
  (ручные баллы через движок). `apps/web/admin/AdminApp.tsx` переписан на реальные данные: гейт входа,
  разделы Обзор (статы+последние заявки+верификация), Заявки (таблица + смена статуса), Выпускники
  (таблица + модалка: верификация/баллы/скидка), Контент → ссылка на Directus Studio.
  Проверено: editor-login, overview (3 заявки), ручные +60 → 536/expert, скидка=5, статус заявки→in_progress,
  alumni-токен на /admin → 401. Визуально Обзор + модалка выпускника на реальных данных.
  Контент-CRUD (новости/программы/товары/блоки) — в Directus Studio (как задумано архитектурой).

## Как возобновить
- Последний зелёный коммит: `feat: Фаза 4 — админка на реальных данных`.
- **Следующий шаг — Фаза 5 (mini-app, частично BLOCKED):** сборка `apps/web` как Telegram Mini App +
  MAX; валидация Telegram `initData` (подпись HMAC по bot-токену — юнит-тест с тестовым ключом),
  заглушка входа MAX; рефералка (deep-link с кодом → `+80` рефереру при верификации приглашённого,
  коллекция `referrals` уже есть). BLOCKED: боевые токены Telegram/MAX — оставить `.env.example` +
  тесты с тестовым ключом, «живую» авторизацию за флагом.
- Docker: команды через ASCII-симлинк `/Users/macbook/club-pravo-hse` + `COMPOSE_BAKE=false`
  (кириллица в пути ломает BuildKit). Сид/bootstrap идемпотентны. `.env` содержит `AUTH_SECRET`.
- Тест-данные: выпускник Анна (после тестов Фазы 4: points 536/expert, personal_discount 5, verified);
  заявки ALU-2026-000001..000003 (одна in_progress). Тест-аккаунты: editor@club.example.com / editor12345,
  alumni@club.example.com / alumni12345.
