# Приёмка cutover · этап 7 · 08.09.2026

Практическая приёмка **сборки cutover** без живых интеграций. Канон – маршруты на `/` (бывший v2), не `/v2`. Историческая матрица [acceptance.md](./acceptance.md) сохраняет доказательства прогонов по путям `/v2/*`; после cutover те же поверхности обслуживаются каноном на `/`, а `/v2/*` только редиректит.

**Стенд:** localhost:5173 / 5274 на момент прогона **не отвечали** (curl → connection failed). Живой браузерный обход канона в этом прогоне не выполнялся.

**Код-инвентарь канона** (`apps/web/src/App.tsx`):

| Путь | Поверхность |
| --- | --- |
| `/` | HomeV2 |
| `/dpo`, `/dpo/:slug` | DpoV2, ProgramV2 |
| `/news`, `/news/:slug` | NewsV2, NewsPostV2 |
| `/events`, `/events/:eventId` | EventsV2 |
| `/merch`, `/merch/:slug` | MerchV2, ProductV2 |
| `/cart` | CartV2 |
| `/join`, `/forgot`, `/reset`, `/confirm` | JoinAuthV2 |
| `/lk`, `/lk/profile` | LkV2, ProfileV2 |
| `/support`, `/support/consent` | SupportV2 |
| `/privacy`, `/confidential`, `/requisites` | legal (режим v2) |
| `/podcasts` | PodcastsV2 |
| `/admin/*` | AdminApp |
| `/v2`, `/v2/*` | StripV2Prefix → канон |
| `/legacy/*` | прежний UI |
| MobileApp | takeover на телефоне для `/`, `/news`, `/dpo`, `/podcasts`, `/merch` (+ вложенные `/dpo/*`, `/news/*`, `/cart`); SupportDock скрыт при takeover |

---

## Сводка статусов этого прогона

| Статус | Число строк матрицы |
| --- | ---: |
| Pass (code review / typecheck / docs) | 28 |
| Pass (unit tests this run) | 6 |
| Deferred | 12 |
| Gap | 0 |

Метод «unit this run» отмечен там, где критерий напрямую подтверждён unit-прогоном 08.09.2026 (скидка ДПО/мерч, заказы, оператор через shared и т.п.). Остальные рабочие критерии – code review + исторические docs; живые SMTP/ЮKassa/Telegram/push/Safari/физическое устройство и полный Playwright – deferred.

---

## Матрица: канон и оболочка (этап 0+)

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| V2-страницы на каноне `/` (Home/DPO/News/Events/Merch/Cart/Join/LK/Support/legal) | Pass (code) | `App.tsx`: lazy `*V2` на корневых путях |
| `/v2` и `/v2/*` редиректят на канон с сохранением search/hash | Pass (code) | `StripV2Prefix` |
| MobileApp takeover на телефоне для ключевых маршрутов | Pass (code) | `MOBILE_APP_ROUTES` + `/dpo/*`, `/news/*`, `/cart` |
| SupportDock скрыт на mobile shell | Pass (code) | `{!mobileTakeover && <SupportDock />}` |
| PWA SW cache `club-v4` + InstallPrompt | Pass (code) | `public/sw.js` CACHE=`club-v4`; `main.tsx` register; `InstallPrompt` |
| `/legacy/*` сохраняет прежний UI | Pass (code) | маршруты legacy в `App.tsx` |
| Полный браузерный matrix / e2e на каноне `/` | Deferred | исторически на `/v2` ([acceptance.md](./acceptance.md)); cutover-пути не перегонялись в этом прогоне |
| PWA offline / Safari / физическое устройство | Deferred | нужен runtime + устройство |

---

## Главная (этап 2)

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| Канон-охра в токенах / оболочке | Pass (code) | `tokens.css` `--p-ohra-*`; Shell коммент о канон-охре |
| Фемида на главной | Pass (code) | `HomeV2`: `/assets/themis.jpeg`, alt про Фемиду |
| Гость «Найти своих» → `/join` | Pass (code) | карточка community: `to: authed ? "/lk" : "/join"` |
| Участник → `/lk` (CTA / «Найти своих») | Pass (code) | те же ветки по `token()` |
| Живой визуальный просмотр главной на стенде | Deferred | стенд не запущен |

---

## ДПО (этап 3)

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| Content-before-price на карточке программы | Pass (code) | `ProgramV2`: колонка содержания слева, цена в aside |
| URL-фильтры / compare / sort | Pass (code) | `DpoV2`: `compare`, `sort`, сброс фильтров в searchParams |
| Скидка только выпускника (после верификации) на ДПО | Pass (unit) | API `orders.test.ts`: скидка на ДПО; непроверенный / подделка JWT без скидки |
| Каталог lead: содержание раньше цены в копирайте | Pass (code) | `DpoV2` lead про содержание/формат; цена выпускника после подтверждения |

---

## События / новости / мерч (этапы 2–3)

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| Афиша `?q=` и `?format=` | Pass (code) | `EventsV2`: `params.get("q")`, `format` |
| Гость RSVP → `/join` | Pass (code) | кнопка «вступить, чтобы записаться» → `/join` |
| Новости: редакционный lead / крупный первый анонс | Pass (code) | `NewsV2`: lead + увеличенный excerpt у первого |
| Мерч: остатки / «нет в наличии» | Pass (code) | `MerchV2`/`ProductV2` Stock + disabled |
| Мерч 404 «Товар не найден» | Pass (code) | `ProductV2` |
| На мерч клубная скидка не действует | Pass (unit) | API orders: «на мерч скидка выпускника не распространяется»; UI CartV2 tip |

---

## Join / корзина / checkout (этапы 4–5)

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| Join: статусы confirm / ожидает проверки офисом | Pass (code) | `JoinAuthV2`: «Проверьте почту», «Заявка отправлена – ожидает проверки» |
| Корзина: подсказка скидки только ДПО; мерч без скидки | Pass (code + unit) | CartV2 lead/tip; unit orders |
| Checkout: save ≠ notify | Pass (code + unit) | UI различает сохранение и уведомление; unit при `[mail:blocked]` заказ всё равно создаётся |
| Реальная доставка писем (SMTP / Mailpit) | Deferred | без живого SMTP |
| ЮKassa live / возвраты | Deferred | unit вебхука есть; live keys нет |
| Telegram / notify live | Deferred | unit telegram есть; live нет |

---

## Кабинет (LK)

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| Overview + CabinetClubOverview | Pass (code) | `LkV2` section overview |
| Achievements `view=all|earned` в URL | Pass (code) | `searchParams` `view` + `section=achievements` |
| Club nav `aria-current` | Pass (code) | `v2/cabinet.tsx` `cabinet-club-nav` |
| Заметка: скидка только на ДПО | Pass (code) | LkV2: «скидка действует только на программы ДПО» |

---

## Support / 152-ФЗ / футер

| Критерий | Статус | Метод / заметка |
| --- | --- | --- |
| Оператор ОГРН 1257700005551 | Pass (code + unit shared контекст) | `CLUB_OPERATOR.ogrn` в shared; SupportV2 + legal/requisites |
| Footer: privacy / requisites / support | Pass (code) | `v2/Shell.tsx` footer links |
| Privacy: цифровые запросы через поддержку | Pass (code) | legal: ссылка на `/support`, тема «Персональные данные» |
| Push-уведомления live | Deferred | код/unit push есть; ключи/браузер – нет |

---

## Явно deferred (внешние / устройство)

| Пункт | Почему deferred |
| --- | --- |
| SMTP / Mailpit end-to-end | нет живой почты в этом прогоне |
| ЮKassa live + возвраты | нет ключей / sandbox UI |
| Telegram bot / notify live | нет токена |
| Web Push production keys | нет VAPID/браузерного grant на стенде |
| Safari + физический телефон | нет устройства в прогоне |
| Полный Playwright / template-matrix на каноне `/` | длинный набор; исторически на `/v2` – см. acceptance.md |
| Стенд curl 200 по канону | :5173 и :5274 недоступны 08.09.2026 ~20:23 MSK |

---

## Проверки этого прогона (числа)

| Проверка | Результат |
| --- | --- |
| `tsc -p packages/shared` --noEmit | 0 ошибок |
| `tsc -p apps/web` --noEmit | 0 ошибок |
| `tsc -p apps/api` --noEmit | 0 ошибок |
| `@club/shared` vitest | **68 passed** / 7 files |
| `@club/api` vitest | **226 passed**, **13 skipped** (gated PG integration) / 21+2 files |
| Playwright full matrix | не запускался (deferred) |
| curl localhost:5173 / 5274 | не доступен |

Исторический контекст (не пересчитывался сегодня): shared 68; API 226 + отдельные PG; e2e/matrix/PWA – [acceptance.md](./acceptance.md), [status.md](./status.md). Пути в старых логах – `/v2`; поведение cutover – те же компоненты на `/`.

---

## Gaps

**Не найдено.** Критерии этапов 0–5, проверяемые кодом и unit без живых интеграций, выполнены. Ограничения только deferred (SMTP, ЮKassa, Telegram, push, Safari/устройство, браузерный matrix на каноне, незапущенный стенд).

---

## Вывод

Cutover-сборка пригодна к локальной приёмке **без живых интеграций**: канон на `/`, редиректы `/v2`, mobile takeover, ключевые продуктовые правила (скидка только ДПО, RSVP→join, achievements URL, оператор 1257700005551, save≠notify) подтверждены code review и/или unit. Перед объявлением полной приёмки нужны: подъём стенда, точечный/полный browser pass по канону, затем SMTP → ЮKassa → Telegram/push → физические клиенты.
