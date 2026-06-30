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
| 5 · mini-app | ядро done; live BLOCKED | feat: Фаза 5 | ✓ (тесты) | initData-валидация + рефералка; токены нужны |
| 6 · Полировка | docs done; Lighthouse BLOCKED (деплой) | feat: Фаза 6 | ~ | README + smoke-тест; reduced-motion/360px/focus есть |

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

- 2026-06-30 Фаза 6 — полировка/доки (частично): README переписан под готовую систему (архитектура,
  старт, маршруты, эндпоинты, тесты, деплой, BLOCKED). Полный smoke-тест стека зелёный: публичные/ЛК/
  админ эндпоинты 200, гарды 401, контейнеры healthy. reduced-motion, видимый focus (.foc), адаптив
  (медиа-запросы до 360px) и состояния loading/empty/error реализованы на экранах по ходу фаз.
  Lighthouse ≥90 и финальный a11y-аудит — требуют деплоя/CI (BLOCKED здесь). 14 тестов зелёные.

  **ИТОГ: MVP готов.** Фазы 0–5 реализованы и проверены (9 функциональных коммитов + Фаза 6 доки).
  Сделано: публичный сайт + CMS, ЛК + геймификация, витрины + заявки без оплаты, админка офиса,
  ядро mini-app (валидация + рефералка). Открыто только то, что требует внешних секретов/деплоя.

- 2026-06-30 Ревью-пасс (pr-review-toolkit: code-reviewer + silent-failure-hunter) и фиксы:
  • Telegram `validateInitData` — сравнение подписи в постоянном времени (`crypto.timingSafeEqual`),
    проверка свежести `auth_date` (`maxAgeSec`, route шлёт 86400), корректный компаратор сортировки;
    +2 теста (итого telegram 6).
  • `POST /orders` — переоценка цен на сервере по каталогу (не доверяем снимку корзины); уникальный
    номер с повтором при гонке (number уникален в БД); пост-коммит шаги (очистка корзины, уведомление)
    в try/catch — сбой после создания заявки больше НЕ выдаётся за полный провал; `notified` показывается
    на экране успеха (предупреждение, если офис не уведомлён).
  • `engine.addPoints` — `grantAchievements` в try/catch (сбой достижений не валит зачисление баллов);
    `runDecay` — пер-итерационный try/catch (один сбой не обрывает пакет).
  • `notify.confirmApplicant` — честная пометка `NOT_IMPLEMENTED` в SMTP-ветке (не делает вид, что письмо ушло).
  • `auth.directusCredsValid` — логирует сетевой сбой Directus (не молчит).
  • Гигиена секретов перепроверена: `.env` не в git, значений секретов в трекнутых файлах нет.
  Не меняли (осознанно): `member_discount` хранит % (по схеме; сумма = subtotal − total_estimate).

## BLOCKED: нужен я
- **Telegram-уведомление офиса**: нужны боевые `OFFICE_TG_BOT_TOKEN` + `OFFICE_TG_CHAT_ID` (создать
  бота у @BotFather, добавить в чат офиса, взять chat_id). Код готов: при наличии токенов офис получает
  уведомление о новой заявке; без них заявка создаётся, но шлётся только лог (`[notify:BLOCKED]`).
  Вписать в `.env` и перезапустить api. Аналогично `SMTP_*` для письма-подтверждения заявителю.
- **Mini-app (Фаза 5 live)**: нужен боевой `TELEGRAM_BOT_TOKEN` (бот Mini App у @BotFather) — тогда
  `/auth/telegram` валидирует initData и пускает выпускника; без токена эндпоинт отвечает 503, а
  валидация подписи покрыта юнит-тестами. MAX mini-app — нужен доступ к их web-app API/Госуслугам.
  Привязка `alumni.telegram_id` к профилю — через будущую регистрацию из мессенджера.

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

- 2026-06-30 Фаза 5 — ядро (done), live BLOCKED: `lib/telegram.ts` валидация Telegram initData
  (HMAC-SHA256 по bot-токену) + 4 юнит-теста (vitest в apps/api). `POST /auth/telegram` (валидирует
  initData, ищет alumni по `telegram_id`, выдаёт сессию) — без `TELEGRAM_BOT_TOKEN` отвечает 503.
  Рефералка: при верификации приглашённого (`alumni.referred_by`) реферер получает `+80` (reason=referral,
  идемпотентно по ключу `referral-<id>`) — встроено в `PATCH /admin/members/:id`. Проверено:
  Anna 536→616 при верификации приглашённого, повтор — без изменений; `/auth/telegram` без токена → 503;
  4 telegram-теста зелёные. Тесты всего: shared 10 + api 4 = 14.

## Как возобновить
- Последний зелёный коммит: `feat: Фаза 5 — initData-валидация + рефералка`.
- **Следующий шаг — Фаза 6 (полировка):** Lighthouse ≥90 (Perf/BP/SEO) на ключевых страницах;
  a11y без критичных; reduced-motion и 360px по всем экранам; состояния loading/empty/error
  (в основном уже есть); обновить README; финальная сводка. Плюс «хвосты» Фазы 5 при наличии токенов:
  собрать `apps/web` как Telegram Mini App (подключить telegram-web-app.js, авто-вход через
  `/auth/telegram`), MAX-обёртку, deep-link рефералки (код в URL → `alumni.referred_by` при регистрации).
- Docker: команды через ASCII-симлинк `/Users/macbook/club-pravo-hse` + `COMPOSE_BAKE=false`
  (кириллица в пути ломает BuildKit). Сид/bootstrap идемпотентны. `.env` содержит `AUTH_SECRET`.
- Тест-данные: выпускник Анна (после тестов Фазы 4: points 536/expert, personal_discount 5, verified);
  заявки ALU-2026-000001..000003 (одна in_progress). Тест-аккаунты: editor@club.example.com / editor12345,
  alumni@club.example.com / alumni12345.
