# Публичное зеркало на GitHub Pages

Витрина клуба без бэкенда, по духу как зеркало ДПО
(`SergeyBuzanov/dpo-pravo-hse` → `npm run publish-mirror`): на Pages только то,
что можно смотреть без Node, админки и секретов.

## URL

https://bogolubov-creator.github.io/club-pravo-hse-mirror/

Репозиторий выкладки: [Bogolubov-creator/club-pravo-hse-mirror](https://github.com/Bogolubov-creator/club-pravo-hse-mirror).
Исходник UI: этот монорепо (`apps/web`).

## Что видно

- Главная, новости, ДПО, карточки программ, мерч, события, подкасты (без аудио), legal.
- Данные – сиды из `packages/shared` (`PROGRAMS_SEED`, `NEWS_SEED`, `PRODUCTS_SEED`) плюс минимальные фикстуры.
- Баннер «Публичное зеркало»; `robots: noindex`.

## Чего нет (намеренно)

- Живой `/api`, Directus, PostgreSQL, Docker.
- Вход в кабинет, заявки, корзина с оформлением, тикеты поддержки, админка.
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

После `vite build` скрипт `apps/web/scripts/prepare-pages.sh` кладёт `404.html`
(копия `index.html` для SPA) и `.nojekyll`.

## CI зеркала

Workflow в `club-pravo-hse-mirror` чекаутит этот репозиторий, собирает
`build:mirror` и публикует артефакт через `actions/deploy-pages`
(как у `dpo-pravo-hse-mirror`, но со сборкой, а не копированием чужого `gh-pages`).
