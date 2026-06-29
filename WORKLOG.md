# WORKLOG

Автономная работа Claude Code по проекту «Клуб выпускников факультета права Вышки».

## Статус фаз
| Фаза | Статус | Коммит | Приёмка | Заметки |
|---|---|---|---|---|
| 0 · Фундамент | done | baseline | ✓ | монорепо, Directus+PG, bootstrap, стек поднят |
| H · Админка (порт дизайна) | done | baseline | ✓ | `apps/web/src/admin/AdminApp.tsx`, мок-данные |
| 1a · Главная + живые новости | done | feat(web): Фаза 1a | ✓ | порт Главной, /api/news, сид новостей |
| 1b · M2A-блоки Главной | todo | – | – | – |
| 2 · ЛК + геймификация | todo | – | – | – |
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

## BLOCKED: нужен я
- (пока нет)

## Как возобновить
- Последний зелёный коммит: см. `git log`. Следующий шаг после 1a – Фаза 1b (M2A-блоки Главной):
  расширить `directus-bootstrap` коллекциями `pages` + `pages_blocks` (M2A) + блок-коллекциями,
  засидить страницу `home`, эндпоинт `/api/pages/home`, `Home.tsx` берёт тексты из блоков.
