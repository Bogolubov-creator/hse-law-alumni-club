# dev/mock-api.mjs – фикстурный mock-API

**Только для локальной визуальной проверки фронта.** Это НЕ проверка реальных
интеграций (Directus/PostgreSQL, ЮKassa, e-mail, push) и НЕ проверка
авторизации/оплаты. Все данные – вымышленные редакционные плейсхолдеры.
В проде не использовать.

## Запуск

```bash
# терминал 1: mock-API (порт 3000, можно переопределить MOCK_PORT)
node dev/mock-api.mjs

# терминал 2: фронт (vite проксирует /api → http://localhost:3000, см. apps/web/vite.config.ts)
pnpm -C apps/web dev
```

Дальше открыть http://localhost:5173 – все запросы фронта на `/api/*`
уходят в mock (vite срезает префикс `/api`, поэтому маршруты в mock без него).

## Что покрыто (GET)

| Путь | Ответ |
|---|---|
| `/health`, `/ready` | `{ok:true, status:"ok", …}` |
| `/stats` | `{alumni, events, programs}` – счётчики для главной |
| `/news`, `/news/:slug`, `/news?limit=N` | 6 новостей клуба (2025–2026) |
| `/programs`, `/programs/:slug` | 6 программ ДПО: цены (копейки), форматы, modules/teachers/dates, `source_url` у маркетплейс-программы, `enrollment:"nonactual"` у одной |
| `/products` | 4 товара мерча с `variants_json` и фото-плейсхолдером `/assets/merch-hoodie.jpg` |
| `/events` | 5 будущих событий (`published`, online/offline, `reg_url`, `going`) |
| `/events/:id.ics` | минимальный валидный `text/calendar` (как в apps/api) |
| `/podcasts` | 3 выпуска: 1 пробный (`is_free`, аудио отдаётся как короткий WAV), 2 закрытых без `audio_url`; `subscribed:false`, `price:399900` |
| `/podcasts/:id/audio` | 3 секунды тишины WAV для пробного выпуска; 403 для закрытых |
| `/pages/home` | `{slug,title,blocks:{hero,cta}}` – свёрнутые M2A-блоки как в apps/api |
| `/timeline` | 5 записей истории клуба |
| `/payments/config` | `{enabled:false}` |
| `/push/vapid` | `{enabled:false, key:null}` |

## Что НЕ покрыто (намеренно)

- **Авторизация**: `/auth/*` и прочие POST/PATCH/DELETE → 503/401
  `{error:"mock: недоступно в фикстурном режиме"}`. Успешный вход не
  имитируется – это не проверка интеграций.
- **Приватка**: `/me*` без токена → 401. Страницы личного кабинета
  деградируют в гостевой режим (ожидаемо).
- **Корзина/заказы/оплата/админка**: не работают, серверных побочных
  эффектов нет.
- Любой прочий путь → 404 `{error:"mock: not implemented", path}`.

Ответы соответствуют zod-схемам из `packages/shared/src/responses.ts`
(их же использует фронт для валидации). Content-Type
`application/json; charset=utf-8`, `Cache-Control: no-store`.
