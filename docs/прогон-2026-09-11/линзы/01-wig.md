# Линза 01 · Web Interface Guidelines (Vercel) · 11.09.2026

Правила скачаны свежие (command.md, сеть была). Проверен код публичного контура из брифа; ✔ – перепроверено вручную по строке.

Итог: 2 P1, 12 P2, 12 P3

## P1

- ✔ P1 · src/mobile/MobileApp.tsx:939 · перемотка плеера – `<div onClick role="slider">` без `tabIndex`/`onKeyDown` · WIG «интерактив с клавиатуры», «div с click» · заменить на `<input type="range" min=0 max={dur} value={pos}>`.
- ✔ P1 · src/mobile/MobileApp.tsx:706–707, 798–800 · поля мобильной заявки: нет `<label>` (только placeholder), `outline: "none"` без замены, нет `name`/`autoComplete`, телефон `type="text"` · WIG «input без label», «outline-none», «autocomplete/type» · взять `Field` из CartV2 + `name`, `autoComplete="name|tel|email"`, `type="tel"`, класс `foc`.

## P2

- ✔ P2 · src/components/ClubSupportBot.tsx:330–335, 307–319 · `aria-modal="true"`, но фокус не заперт, фон не `inert`, при закрытии фокус не возвращается на ворону; ClubSupportBot.css:55 лог без `overscroll-behavior: contain` · WIG «диалоги» · либо `aria-modal="false"`, либо ловушка из Modal.tsx + возврат фокуса в SupportDock.
- ✔ P2 · src/v2/Shell.tsx:64 + src/pages/legal.tsx:115 + src/components/CookieBanner.tsx:67 · шапка sticky ~72px, `scroll-padding-top` нигде нет: переход `/privacy#cookies` прячет заголовок под шапку (RouteScroll.tsx:14) · WIG «scroll-margin-top», «sticky не закрывает фокус» · `html { scroll-padding-top: 88px }`.
- ✔ P2 · src/v2/Shell.tsx:76–95 · ссылки шапки и CTA без hover: `.nav-link:hover` (index.css:24) не применяется – класса нет; `.club-btn` (index.css:495–504) тоже без `:hover` · WIG «hover у кнопок/ссылок» · добавить hover-цвет и `filter: brightness(.96)`, как у cookie-баннера.
- ✔ P2 · src/pages/CartV2.tsx:71, 306–308 · контакты без `name`/`autoComplete` (`name`, `tel`, `email`), без `spellCheck={false}` · WIG «Forms» · пробросить в `Field`, как в JoinAuthV2.
- ✔ P2 · src/pages/EventsV2.tsx:183 · афиша `<img>` без `width`/`height` → CLS · WIG «Images» · задать размеры + `loading="lazy"`.
- P2 · src/components/Modal.tsx:46, 55 · `overflow: auto` без `overscroll-behavior: contain` – на iOS прокрутка уводит страницу · добавить обоим слоям.
- P2 · src/mobile/MobileApp.tsx:327–328, 495 · фильтры мобильной ДПО в `useState` (десктоп DpoV2.tsx:26–43 – в URL): `/dpo?direction=…` на телефоне теряется; чипы без `aria-pressed` · WIG «URL отражает состояние» · `useSearchParams` + `aria-pressed`.
- P2 · src/mobile/MobileApp.tsx:643, 751, 840, 909, 986 (и 743, 762, 889, 931) · навигация `<button onClick={() => nav(...)}>` вместо `<Link>` – нет Cmd-клика и средней кнопки · заменить на `<Link>`; `nav(-1)` оставить.
- P2 · index.html:10 + src/styles/tokens.css:158 · нет `color-scheme: dark` для `[data-theme="dark"]` – скроллбары и `<select>` светлые; `theme-color` `#EC5A13` ≠ фон и без dark-варианта · WIG «Dark Mode» · `color-scheme` в токенах, два `<meta theme-color media=…>`.
- ✔ P2 · src/styles/vestnik-home.css:163–169 + src/pages/HomeV2.tsx:139 · маркиза 36 с бесконечно, пауза только `:hover/:focus-within`, а блок `aria-hidden tabIndex={-1}` – с клавиатуры и тача не остановить; зерно (стр. 57) 16 с · WIG/WCAG 2.2.2 «autoplay >5 с – pause» · кнопка паузы или стоп по тапу.
- P2 · src/pages/DpoV2.tsx:371–376 · `role="tablist"/"tab"` без `tabpanel` и стрелок · WIG «семантика до ARIA» · `aria-pressed` или radio.
- P2 · src/pages/SupportV2.tsx:314–333 · «Удалить обращение» стирает переписку сразу; `<details>` – не подтверждение · WIG «деструктивное – подтверждение/undo» · Modal «Удалить / Отмена».

## P3

- src/index.css:11 · `.foc:focus-visible { border-radius: var(--r-sm) }` перебивает пилюли 999px – на фокусе кнопка становится прямоугольной.
- src/pages/JoinAuthV2.tsx:78, 209, 218, 253 · нет `name`, `autoComplete="off"` на году/программе, `spellCheck={false}` на почте; ошибка одна внизу без фокуса; нет guard при уходе с анкеты.
- src/mobile/MobileApp.tsx:1050, 631, 754 · `.noscroll` не определён в CSS; внутренние скроллеры без `overscroll-behavior`.
- src/mobile/MobileApp.tsx:430, 511, 544, 984 · обложки через `background-image` – нет `lazy`/`alt`; 540, 507 – нет `isError`; 295, 656, 756 – ошибки без «что делать».
- src/mobile/MobileApp.tsx:40 · `aria-label="Корзина"` скрывает счётчик; 671–678 – `div` вместо `h2`; EventsV2.tsx:109 – `h3` под `h1` без `h2`.
- src/lib/api.ts:83 · `rub()` – обычный пробел перед «₽», перенос отрывает знак (и PodcastsV2.tsx:39) · ` `.
- Заголовки без `text-wrap: balance`: ProgramV2.tsx:130, NewsV2.tsx:164, CartV2.tsx:96, JoinAuthV2.tsx:54, ProductV2.tsx:59.
- src/index.css:15–46 · мёртвые правила v1 (`.marq-track`, `.nav-link`, `.vcard`, `.two-col`, `.hero-grid`); `[class] { transition: none !important }` гасит и переходы цвета.
- src/components/ClubSupportBot.tsx:307 · программный фокус при открытии – на телефоне сразу клавиатура · WIG «autoFocus только desktop».
- `translate="no"` нет у «ЮKassa» (legal.tsx:70), «Rusprofile» (SupportV2.tsx:73), Telegram-хэндла (Shell.tsx:150).
- src/components/Toast.tsx:25 · `bottom: 24` без `safe-area` и `--tabs-h` – тост ложится на вкладки.
- src/mobile/MobileApp.tsx:133, 145, 919 · inline-анимации без класса – reduced-motion (index.css:16 `[class]`) их не гасит; `width` не композитное; home-motion.ts:27 не слушает смену настройки.

## Что хорошо

- Modal.tsx – образцовый диалог: Esc, `inert`, ловушка Tab, возврат фокуса.
- Skip-link + `id="main"` везде; иконки-кнопки с `aria-label`, декор `aria-hidden`.
- `touch-action: manipulation`, `viewport-fit=cover` + `env(safe-area-*)`, 16px в полях на телефоне.
- Даты и суммы через `Intl`, табличные цифры в реестрах.
- Фильтры десктопных витрин в URL; label оборачивает control; live-регион тоста смонтирован постоянно.

## Решения владельца

1. WIG: «кнопка отправки активна до запроса». JoinAuthV2.tsx:255 и CartV2.tsx:350 отключают её до согласия, меняя подпись. Оставить или включить кнопку и показывать ошибку у чекбокса?
2. Маркиза главной – решение 09.09 (gpt-taste, вечное движение); WIG/WCAG требуют видимую паузу. Добавить кнопку паузы или принять отступление?
3. `.foc` даёт кольцо радиусом 8px, DESIGN.md держит пилюли 999px. Убрать радиус из `.foc`?
4. Панель бота: по-настоящему модальная (ловушка) или немодальная (`aria-modal="false"`)?
5. Мобильная оболочка осознанно проще десктопа. Переносить ли фильтры ДПО в URL и «Назад» на `<Link>`, или это принятое упрощение?
