# Аналитика в админке · 09.09.2026

## Аудит сайта (сводка)

| Поверхность | Статус |
| --- | --- |
| Публичные разделы (ДПО, мерч, новости, события, подкасты, join, support, ЛК) | Данные пишутся в Directus / Postgres |
| Обзор админки | Операционные счётчики «сейчас», без окон 7/30/90 |
| Подписки | Уже был богатый разрез прослушиваний |
| Журнал | Сырой audit_log, не KPI |
| Просмотры страниц / cookie / PWA / FAQ-бот | На сервере не пишутся – вне v1 |

## Что сделано

- `GET /admin/analytics?range=7d|30d|90d` – агрегаты без ПДн
- `GET /admin/analytics/export.csv` – плоский CSV (section;key;value)
- Вкладка **Аналитика** в админке (между Обзором и Заявками): пульс, разрезы заявок/баллов/достижений/событий/подкастов/поддержки, выгрузка CSV

Источники: `alumni`, `orders`, `event_rsvps`, `podcast_plays`, `alumni_achievements`, `points_ledger`, `audit_log`, `push_subs`, `alumni_friends`, `club_support_tickets`.

## Вне v1

Маяки page view / CTA, cookie consent rates, PWA install, логи FAQ-бота, chart-библиотеки.
