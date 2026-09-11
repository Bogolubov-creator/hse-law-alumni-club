# Публичное зеркало на GitHub Pages

Витрина клуба без бэкенда, по духу как зеркало ДПО
(`SergeyBuzanov/dpo-pravo-hse` → `npm run publish-mirror`): на Pages – смотреть
витрину, демо-кабинет и демо-админку без живого API и секретов.

## URL

https://bogolubov-creator.github.io/club-pravo-hse-mirror/

Репозиторий выкладки: [Bogolubov-creator/club-pravo-hse-mirror](https://github.com/Bogolubov-creator/club-pravo-hse-mirror).
Исходник UI: этот монорепо (`apps/web`).

## Что видно

- Главная, новости, ДПО, карточки программ, мерч, события, подкасты (без аудио), legal.
- **Кабинет** `/lk` и **админка** `/admin` – демо-сессия (токены сидятся автоматически).
- Данные – сиды из `packages/shared` плюс фикстуры ЛК/админки.
- Баннер со ссылками на кабинет, админку и «Смотреть как на телефоне» (`?pwa=1`); `robots: noindex`.

## Чего нет (намеренно)

- Живой `/api`, Directus, PostgreSQL, Docker.
- Реальное сохранение заявок, правок контента, тикетов.
- Индексация поисковиками.

Параллель с ДПО: там на Pages не работают форма заявки и аналитика (нужен Node);
здесь мутации отвечают «на зеркале недоступно».

## Локальная сборка

```bash
pnpm --filter @club/web build:mirror
pnpm --filter @club/web preview:mirror
# открыть http://127.0.0.1:4173/club-pravo-hse-mirror/
```

Переменные: `VITE_MIRROR=true`, `VITE_BASE=/club-pravo-hse-mirror/`,
`VITE_SITE_URL=https://bogolubov-creator.github.io/club-pravo-hse-mirror`.
Прод-Docker эти флаги **не** получает.

## Мобильный просмотр (тот же стенд)

Отдельное Pages-зеркало под телефон не делаем. На зеркале и локально –
`?pwa=1` включает phone-shell на сессию (см. `use-pwa` / `PwaShell`).

- Баннер зеркала: ссылка «Смотреть как на телефоне» → `/?pwa=1`.
- Локально: `pnpm --filter @club/web preview:mobile` →
  `http://127.0.0.1:5285/?pwa=1` (удобно смотреть в колонке телефона DevTools).

После `vite build` скрипт `apps/web/scripts/prepare-pages.sh` кладёт `404.html`
(копия `index.html` для SPA) и `.nojekyll`.

## CI зеркала

Workflow в `club-pravo-hse-mirror` чекаутит этот репозиторий, собирает
`build:mirror` и публикует артефакт через `actions/deploy-pages`
(как у `dpo-pravo-hse-mirror`, но со сборкой, а не копированием чужого `gh-pages`).

Dispatch: `source_ref=codex/v3-backlog-polish` (или тег/SHA), чтобы на Pages
попали актуальные PWA/mobile/perf с PR #23.

## Overnight Phase 6 · открытые хвосты (11.09.2026)

Зеркало не закрывает: банковские реквизиты (TBD / нет в Rusprofile), фото
`graduate-robe`, live `/programs` без здорового Directus в e2e, опциональные
chip-фильтры ДПО, Admin JWT в `localStorage`, ручной A2HS на устройстве.
