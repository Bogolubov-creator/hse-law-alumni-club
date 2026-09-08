# Приёмка cutover · обновление 09.09.2026

Дополнение к [acceptance-cutover-2026-09-08.md](./acceptance-cutover-2026-09-08.md). Стенд: Directus `http://127.0.0.1:8255`, API `:3200`, web preview `http://127.0.0.1:5274`. Compose project `alumni-staged-comparison`.

## Подкасты «Правовая грамотность»

Загружены 7 выпусков в локальный Directus (том `directus_uploads`, не в git). Манифест: `/Users/macbook/alumni-staged-evidence/pravovaya-gramotnost-manifest.json`. Скрипт: `pnpm --filter @club/scripts run load-pravovaya-gramotnost` (только localhost:8255).

| Выпуск | Доступ | Длительность |
| --- | --- | --- |
| Данил Данюков | пробный (`is_free`) | 35 мин |
| Алексей Волос | подписка | 108 мин |
| Глеб Беседин | подписка | 71 мин |
| Дмитрий Балашов | подписка | 112 мин |
| Мария Матвеева | подписка | 115 мин |
| Фатима Дзгоева | подписка | 76 мин |
| Николай Николаев | подписка | 117 мин |

Демо samplelib сняты с `published` → `draft`.

Проверки 09.09.2026:

| Критерий | Статус | Метод |
| --- | --- | --- |
| `GET /podcasts` = 7 реальных выпусков | Pass | curl API |
| Гость: audio только у Данюкова | Pass | curl list |
| Range 206 на free через preview `/api/...` | Pass | curl Range bytes=0-1023 → audio/mpeg |
| Платные без audio_url у гостя | Pass | curl list |

## Канон `/`

| Критерий | Статус | Метод |
| --- | --- | --- |
| `/` отдаёт HomeV2 (сборка V3) | Pass | preview build с `6448be8`+diff |
| Admin `audio_url` принимает UUID Directus | Pass | код `admin.ts` |
| E2E пути переведены с `/v2` на `/`; legacy-сторож вместо v1 | Pass | diff e2e |
| Полный Playwright matrix | Deferred | гонять выборочно после unit |
| SMTP / ЮKassa / Telegram / push | Deferred | блокер **live**-релиза, не локальной готовности к публикации |
| Production deploy | Не выполнялся | по задаче |

## Admin / контент

- Форма подкаста: подсказка «https или UUID файла Directus».
- `video_url` сохраняется через admin API и отдаётся в `GET /admin/podcasts`.
