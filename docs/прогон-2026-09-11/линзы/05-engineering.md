# 05 · Линза «инженерия фронтенда» (frontend-ui-engineering + performance-optimization)

Итог: 3 P1, 9 P2, 9 P3

Метод: код apps/web, два прогона Playwright по зеркалу (скрипты в scratchpad), контраст по hex из tokens.css.

## P1

- P1 · src/mobile/MobileApp.tsx:1049–1050, src/components/CookieBanner.tsx:37 · оболочка не читает `--cookie-h`: баннер (307 px при 390, 376 при 320) накрывает скроллер – в конце списка низ карточки 715 px > верх баннера 466 px, её «В корзину» недоступна · WCAG 2.4.11 · `paddingBottom: "var(--cookie-h, 0px)"` на скроллере (строка 1050).
- P1 · src/mobile/MobileApp.tsx:707 · `CartField`: ФИО/телефон/e-mail без `<label>` (только placeholder), без `name`/`autoComplete`, телефон `type="text"` · WCAG 1.3.1, 3.3.2, 1.3.5 · `label htmlFor` + `autoComplete="name|tel|email"`, `type="tel"`.
- P1 · src/mobile/MobileApp.tsx:939 · перемотка плеера – `div role="slider"` с одним `onClick`, без `tabIndex` и клавиш · WCAG 2.1.1 · `<input type="range">`.

## P2

- P2 · src/index.css:297–302 · `.club-cookie-banner__actions { flex: 0 0 auto }` не сжимается: правый край «Только необходимые» = 383 px при любой ширине – при 320 обрезано 79 px, при 390 кнопка за краем плашки · 1.4.10 · `flex: 1 1 100%; min-width: 0`.
- P2 · src/components/RouteScroll.tsx:16,19 + MobileApp.tsx:1050 (`key={pathname}`) · «назад» теряет позицию (замер: 2500 → 0): хранится `window.scrollY`, в оболочке всегда 0 · хранить `scrollTop` скроллера по `location.key`, убрать `key`.
- P2 · src/mobile/MobileApp.tsx:1049 · `height: 100dvh; overflow: hidden`: документ не скроллится: нет `<main>` и skip-link, печать – один экран (нет `@media print`), на iOS тап по статус-бару и сворачивание панели не работают (проверить) · `min-height`, экран в `<main>`.
- P2 · index.html:98, src/App.tsx:23 · LCP-картинка главной запрашивается после трёх JS-хопов index → HomeV2 → HeroPicture; `#root` пуст, FCP = JS (десктоп FCP 3,6 с, LCP 7,9 с) · `<link rel="preload" as="image">` themis.avif и `modulepreload` HomeV2.
- P2 · src/mobile/MobileApp.tsx:430 · обложки – `background-image` без lazy: мобильный /dpo тянет все 25 jpg (0,7–1,8 МБ) сразу; десктоп DpoV2.tsx:169 делает `<img loading="lazy">` · то же + webp.
- P2 · src/styles/tokens.css:147 · в тёмной теме `--c-link` = #2e6fae: 3,39:1 на #14181f (NewsV2.tsx:84 «читать →», 14 px) · AA 4,5:1 · `--c-link: #6f9bd8` (6,2:1) в блоках 133–176.
- P2 · src/mobile/MobileApp.tsx:495 · чипы фильтров без `aria-pressed` · ARIA toggle · `aria-pressed={on}`.
- P2 · src/pages/DpoV2.tsx:96–104 · `role="tablist"/"tab"` без `tabpanel` и стрелок (нет `onKeyDown`) · APG Tabs · кнопки с `aria-pressed`.
- P2 · vite.config.ts:41, src/App.tsx:4, src/main.tsx:7 · первый заход 237 КБ gz JS (main 95 + react 59 + query 14 + HomeV2 49,5) при бюджете 200; в main статически crow-mascot.js (45 КБ) и ClubSupportBot (15 КБ) через SupportDock, mirror.ts (30 КБ демо-фикстур) едет и на прод · `import()` маскота после `load`, фикстур – при `isMirror`.

## P3

- P3 · src/v2/Shell.tsx:98–104 · бургер не закрывается Escape (замер), нет `aria-controls`.
- P3 · src/pages/EventsV2.tsx:191 · второй `<h1>` в модалке быстрого просмотра (замер: 2 h1) · `h2`.
- P3 · src/mobile/MobileApp.tsx:100, 752 · h1 главной = имя пользователя («Анна»); /cart без h1.
- P3 · src/pages/MerchV2.tsx:164, EventsV2.tsx:176 · «Повторить» при ошибке – голый `<button>` без `foc` и 44 px.
- P3 · src/pages/CartV2.tsx:306–308 · поля без `autoComplete`; во всём контуре нет `aria-invalid`/`aria-describedby` (grep 0).
- P3 · public/fonts/fonts.css:14–20, 49–55, 72–78 · Thin и три Italic не используются (grep 0) – 70 КБ мёртвых файлов; `fontWeight: 500` (27 мест) и `800` (14) без начертаний, 500 рендерится как 400.
- P3 · index.html:93–94 · preload только Sans Regular/Black, а каждый h1 – HSE Slab 400 (primitives.ts:31, vestnik-home.css:85) → FOUT титула; первый заход по коду ≈ 5 файлов / 112 КБ (на зеркале 404) · preload HSESlab-Regular.
- P3 · src/components/ErrorBoundary.tsx:37,49 · захардкожены светлые цвета – в тёмной теме #1D2433 на графите.
- P3 · src/mobile/ClubTabBar.tsx:129, MobileApp.tsx:452, 759 · #6E675A неактивного таба 3,18:1 на тёмном; #B8B0A0 старой цены 2,15:1; иконка #C49A45 на #F2E3CF 2,07:1 (1.4.11 требует 3:1) · токены.
- P3 · src/lib/theme.tsx:21 · `data-theme` ставится после JS – вспышка светлой темы при сохранённой тёмной, нет `color-scheme` · инлайн-скрипт в `<head>`.

## Измерения (зеркало, прогон 1 / прогон 2)

Сеть до Pages нестабильна (TTFB 0,4–2,2 с, раз 14,5 с), CPU делится с другими линзами – абсолютные цифры шумят, структурные выводы устойчивы.

| Страница | Профиль | LCP, мс | Элемент LCP | CLS | JS: файлов / КБ raw / КБ transfer | CSS | Картинки | TTI≈, мс | Long tasks |
|---|---|---|---|---|---|---|---|---|---|
| / | 1440×900 | 7924 / 15540* | img.vestnik-themis (themis.avif) | 0 | 10 / 765 / 237 | 3 / 76 КБ | 12 / 94 КБ (11 слоёв вороны + themis) | 8300 | 15 (4,8 с) |
| /dpo | 1440×900 | 4196 / 24884* | img.club-dpo-masthead__photo | 0 | 10 / 651 / 191 | 3 / 74 | 8 / 493 КБ (7 jpg по 52–88 КБ) | 5700 | 15 (2,9 с) |
| /merch | 1440×900 | 5156 / 5940 | img (themis.webp) | 0,072 | 9 / 648 / 191 | 2 / 64 | 2 / 22 КБ | 4300 | 8 (1,4 с) |
| / | 390×844 | 9200 / 2908 | p.club-cookie-banner__text | 0,004 | 8 / 692 / 199 | 2 / 64 | 1 / 47 КБ | 4900–11200 | 7–9 |
| /dpo | 390×844 | 2944 / 3376 | p.club-cookie-banner__text | 0 | 8 / 692 / 199 | 2 / 64 | 25 / 1806 КБ | 5400 | 8–10 |
| /merch | 390×844 | 3160 / 2720 | p.club-cookie-banner__text | 0 | 8 / 692 / 199 | 2 / 64 | 2 / 60 КБ | 3900 | 6–9 |

\* сетевой сбой второго прогона.

Шрифты: 8 запросов, 2×200 (preload) + 6×404 (пути зеркала). На телефоне LCP – текст cookie-баннера: крупнее любого контента первого экрана. Самый большой чанк index 376 КБ / 95 gz. Дублирования react/query нет (по одному чанку с `react.element`/`QueryObserver`); GSAP + ScrollTrigger только в HomeV2 (127 КБ / 49,5 gz). Высота мобильных страниц ровно 844 = `height: 100dvh` оболочки, см. P1/P2.

## Что хорошо

- Modal.tsx:14–41: `inert` фону, ловушка Tab, Esc, возврат фокуса; фокус уходит в dialog (замер).
- Кнопки-иконки шапки с `aria-label` + `aria-pressed`/`aria-expanded`; на десктопе нет безымянных кнопок.
- Пять витрин: загрузка/ошибка/пустота с `role="status"`/`alert` и «Повторить».
- CLS ≈ 0; на 320 px нет горизонтального переполнения на 10 маршрутах.
- Чанки по маршрутам, `reduced-motion` учтён в CSS и GSAP.

## Решения владельца

1. MobileApp: внутренний скроллер «как приложение» или нативный скролл документа – от этого зависят «назад», печать, iOS-жесты.
2. Бюджет 200 КБ gz (Османи) против вороны-маскота и бота на всех страницах (DESIGN.md 08.09): отложить после LCP или принять 237 КБ?
3. Cookie-баннер 307–376 px на телефоне: полный текст по 152-ФЗ или компактная строка с раскрытием?
4. Шрифты: удалить Thin/Italic и заменить `500` явными 400/600, либо добавить Medium.
