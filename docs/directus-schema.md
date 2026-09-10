# Схема данных Directus — Клуб выпускников факультета права Вышки

> Источник правды для Фазы 0. Соответствует «Инструкции для Claude Code» (актуальная версия).
> **Название:** Клуб выпускников **факультета права** НИУ ВШЭ. «Бизнес и право» — программа/трек внутри факультета, не название клуба.
> **Оплаты в проекте НЕТ.** Заказ = **заявка с контактами**; офис обрабатывает вручную. Никаких платёжных интеграций и карточных данных.
> Стек: Directus + PostgreSQL + Fastify (apps/api) + Docker. Деньги в каталогах — целые **копейки** (integer), показываются справочно. Время — timestamp UTC.

---

## 0. Разделение ответственности
- **Directus** = бэкенд правды + админка + auth + роли. Контент (pages, news), каталоги (programs, products), профили (alumni), реестр баллов (points_ledger), достижения, заявки (orders).
- **apps/api (Fastify)** = чего нет в CMS: корзина, оформление заявки, **уведомление офиса** (email/Telegram-бот), движок уровней/достижений, **cron-decay**, авторизация mini-app. Ходит в Directus сервисным токеном (роль `service`).
- **Кэш агрегатов:** `points_cached`/`level_cached` в `alumni` — денормализация для UI; источник правды — `points_ledger`. Пересчёт делает apps/api после каждой записи в ledger (в транзакции) + ночная сверка.

---

## 1. Пользователи и роли
Используем встроенный **`directus_users`** (email, password, first/last_name, role, status, external_identifier — для Telegram/«Макс»/Госуслуг). Профиль выпускника — `alumni`, 1:1 с `directus_users`.

| Роль | app | admin | Назначение |
|---|---|---|---|
| `guest` (public) | – | – | публичное чтение, корзина, оформление заявки |
| `alumni` | да | нет | ЛК, скидка по уровню, свои заявки, рефералка |
| `editor` (учебный офис) | да | нет | CMS, новости, витрины, заявки, верификация, ручные баллы/скидки |
| `admin` | да | да | всё + правила достижений/уровней, роли |
| `service` | – | – | токен для apps/api |

---

## 2. Коллекции

### 2.1 `alumni` — профиль выпускника (1:1 с directus_users)
| Поле | Тип | Notes |
|---|---|---|
| id | uuid (PK) | |
| user_id | M2O → directus_users | unique (1:1) |
| fio | string | |
| cohort | string | выпуск: «2024» / «2025» |
| status | string enum | `active`/`inactive`/`alumni_left` |
| verification_status | string enum | `pending`/`verified`/`rejected` |
| verified_by | M2O → directus_users | nullable |
| verified_at | timestamp | nullable |
| points_cached | integer | default 0 (кэш из ledger) |
| level_cached | string enum | `graduate`/`friend`/`expert`/`ambassador`, default `graduate` |
| personal_discount | integer | доп. персональная скидка %, default 0 |
| contacts_json | json | {phone, email, telegram, …} |
| referral_code | string | unique (для фазы 5) |
| referred_by | M2O → alumni | nullable |
| avatar | M2O → directus_files | nullable |
| joined_at | timestamp | |
| last_activity_at | timestamp | для decay |

**Индексы:** `user_id` unique, `referral_code` unique, `level_cached`, `verification_status`.

### 2.2 `points_ledger` — реестр баллов (ИСТОЧНИК ПРАВДЫ, append-only)
| Поле | Тип | Notes |
|---|---|---|
| id | uuid (PK) | |
| alumni_id | M2O → alumni | индекс |
| delta | integer | +/− (decay отрицательный) |
| reason | string enum | `program`/`event`/`referral`/`mentorship`/`order`/`decay`/`manual`/`achievement` |
| ref | string | order_number / program_id / achievement_key, nullable |
| comment | text | для ручных начислений (кто/почему) |
| idempotency_key | string | unique nullable (decay/события) |
| created_at | timestamp | |

Баланс = `SUM(delta)`. Без update/delete для alumni/editor.
**Индексы:** `(alumni_id, created_at)`, `idempotency_key` unique.

### 2.3 `levels` — конфиг уровней
| key | title | min_points | discount_percent |
|---|---|---|---|
| graduate | Выпускник | 0 | 5 |
| friend | Друг клуба | 200 | 10 |
| expert | Знаток | 500 | 15 |
| ambassador | Амбассадор | 1000 | 20 |

Поля: id, key(unique), title, min_points, discount_percent, sort, color.
Уровень = max(level где min_points ≤ points_cached).

### 2.4 `point_rules` — конфиг начислений
| reason | points |
|---|---|
| program | 100 |
| event | 60 |
| referral | 80 |
| mentorship | 120 |

Поля: id, reason(enum), points, active(bool), description.

### 2.5 `achievements`
| key | title | rule_json |
|---|---|---|
| first_step | Первый шаг | `{"type":"programs_completed","gte":1}` |
| networker | Нетворкер | `{"type":"events_attended","gte":1}` |
| expert3 | Знаток | `{"type":"programs_completed","gte":3}` |
| mentor | Наставник | `{"type":"mentorship_count","gte":1}` |
| legend | Легенда выпуска | `{"type":"points","gte":1000}` |

Поля: id, key(unique), title, description, rule_json(json), icon(M2O files), points_reward(int default 0), sort.
> В прототипе «Наставник» открывался на 2 пройденных программах — это заглушка; реальное правило = менторство.

### 2.6 `alumni_achievements` (M2M)
id, alumni_id (M2O), achievement_id (M2O), earned_at. Unique `(alumni_id, achievement_id)`.

### 2.7 `pages` — блочный CMS (M2A)
**Фаза 0:** минимально — id, slug(unique), title, status(`draft`/`published`/`archived`), sort.
**Фаза 1:** блоки через нативный Directus **Many-to-Any** (Builder в админке), НЕ `blocks_json` — офис правит страницы без кода. Поле `blocks_json` исключено (решение оркестратора 3.3).

### 2.8 `news`
id, slug(unique), title, cover(M2O files), excerpt(text), body(text rich/md), source_url(string — t.me/pravohse), published_at(timestamp), status(`draft`/`published`).

### 2.9 `programs` — каталог ДПО
id, slug(unique), title, direction(enum/M2O), format(`online`/`offline`/`blended`), duration(string/int — недели/часы), price(integer копейки), dates(json [{start,end}]), capacity(int), seats_taken(int default 0), modules(json), teachers(json), gallery(M2M files), description(text), status(`draft`/`published`/`archived`).
> Сид из прототипа: Антикоррупционный комплаенс 48000₽, Цифровое право и ИИ 62000₽, GR 54000₽, M&A 71000₽, Арбитраж и медиация 46000₽, Юрист как лидер 39000₽ (цены в копейках ×100).

### 2.10 `products` — каталог мерча
id, slug(unique), title, category(enum/M2O), price(integer копейки), images(M2M files), variants_json(json `[{sku, size, color, stock}]`), stock(int — общий, если без вариантов), description(text), status.
> Остаток на уровне варианта внутри variants_json (по инструкции). Если ассортимент вырастет — вынести в отдельную `product_variants`.

### 2.11 `carts`
id, alumni_id(M2O nullable) | session_token(string nullable), items_json (json `[{type:"dpo"|"merch", ref_id, variant_sku?, qty, price_snapshot}]`), updated_at. Управляется apps/api.
**Индексы:** alumni_id, session_token.

### 2.12 `orders` — ЗАЯВКА (без оплаты)
| Поле | Тип | Notes |
|---|---|---|
| id | uuid (PK) | |
| number | string | человекочитаемый, unique (ALU-2026-000123) |
| alumni_id | M2O → alumni | nullable (гостевая заявка) |
| type | string enum | `dpo`/`merch`/`mixed` |
| items_json | json | снапшот позиций с ценами на момент заявки |
| subtotal | integer | копейки до скидки |
| member_discount | integer | **справочная** скидка % (level + personal) |
| total_estimate | integer | копейки, **оценочно** (для справки, не платёж) |
| contact_fio | string | |
| contact_phone | string | |
| contact_email | string | |
| fulfillment | string enum | `pickup`/`delivery` |
| address | text | nullable (для delivery мерча) |
| comment | text | nullable |
| consent_pdn | boolean | согласие на обработку ПДн (обяз. для оформления) |
| status | string enum | `new`/`in_progress`/`confirmed`/`done`/`canceled` |
| created_at | timestamp | |

**Денежных операций нет.** `total_estimate` и `member_discount` — справочные.
**Индексы:** number unique, alumni_id, status.

### 2.13 `offers` — персональные/уровневые предложения
id, kind(`level`/`personal`), alumni_id(M2O nullable, для personal), level_key(string nullable, для level), percent(int), title(string), active(bool), valid_until(timestamp nullable).

### 2.14 `referrals` (фаза 5)
id, referrer_id(M2O alumni), invited_user_id(M2O directus_users nullable), code(string), status(`pending`/`confirmed`), reward_points(int, +80 при confirmed), created_at.

---

## 3. Геймификация — формулы (apps/api)
- **Баланс:** `points_cached = SUM(points_ledger.delta)`.
- **Уровень:** наивысший `levels.key` где `min_points ≤ points_cached`.
- **Скидка (справочная, решение 3.1):** `member_discount = min(level.discount_percent + clamp(personal_discount, 0, 10), 25)`, не ниже 0. `personal_discount` ставит офис (0–10%). Число справочное (оплаты нет), но держим осмысленным; в заявке пишем применённый % справочно.
- **Decay (node-cron, 1×/мес):** если `now - last_activity_at > 30 дней` → `delta = -ROUND(points_cached * 0.15)`, reason=`decay`, idempotency_key=`decay-{alumni_id}-{YYYY-MM}`; пересчёт уровня; при понижении — событие «просел». (В прототипе была визуальная заглушка −150.)
- **Триггеры достижений:** после каждой ledger-записи прогон `rule_json` для этого alumni; `expert3` = 3 завершённые программы.

**Эндпоинты Фазы 2:** `POST /points` (reason), `GET /me/level`, `GET /me/ledger`.

---

## 4. Заявки (apps/api, Фаза 3)
- Корзина: `GET/POST/PATCH/DELETE /cart`.
- `POST /orders` — собрать контакты + согласие ПДн, посчитать subtotal/member_discount/total_estimate (справочно), создать заказ `status=new`, присвоить `number`.
- **Уведомление офиса** о новой заявке: email и/или Telegram-бот офиса (токены в .env). Письмо-подтверждение заявителю с номером.
- ЛК: `GET /me/orders`. Админка: смена статусов new → in_progress → confirmed → done/canceled.

---

## 5. Сиды (db_init / seed)
- `levels` (4), `point_rules` (4), `achievements` (5) — см. выше.
- `programs` — 6 строк из прототипа.
- Роли guest/alumni/editor/admin/service + сервисный токен в `.env` (`DIRECTUS_SERVICE_TOKEN`).

---

## 6. Матрица прав (Directus permissions)
| Коллекция | guest | alumni | editor | admin | service |
|---|---|---|---|---|---|
| pages/news/programs/products (published) | read | read | CRUD | CRUD | read |
| alumni | – | r/u **свой** | read all + verify | CRUD | CRUD |
| points_ledger | – | r **свой** | create(manual)+read | CRUD | CRUD |
| levels/point_rules/achievements | read | read | read | CRUD | read |
| alumni_achievements | – | r **свой** | read all | CRUD | CRUD |
| carts | create/r/u **свой/session** | CRUD **свой** | read | CRUD | CRUD |
| orders | create | r **свой** | read/update all | CRUD | CRUD |
| offers | – | r **свои/level** | CRUD | CRUD | read |

> «свой» = фильтр по `alumni_id = $CURRENT_USER.alumni`. Создание заявок/ledger — через apps/api (роль service).

---

## 7. Открытые вопросы
1. **Потолок скидки:** нужен ли cap на `level + personal` (герой: «до 20%»)? Default — без потолка.
2. **«Два выпуска»** = две когорты `cohort` (подтверждено прототипом: ’24 и ’25).
3. **Канал уведомления офиса:** email, Telegram-бот, или оба? Нужны адрес/токен.
4. **blocks** в pages: json vs нативный M2A — выбрать в Фазе 1.
5. **Палитра/шрифты:** прототип (ohra #ED5A18, kobalt #15375E, Unbounded+Manrope) новее дока — синхронизировать с Claude Design.
