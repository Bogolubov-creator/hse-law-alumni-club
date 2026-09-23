# 04 · Линза «движение» · emil-design-eng, gpt-taste, apple-design, improve-animations · 11.09.2026

Выбор заказчика по поверхностям принят как данность. Пути – от `apps/web/src/`.

**Итог: 0 P1, 5 P2, 11 P3**

## P2

- P2 · `v2/home-motion.ts:51` · scrub-reveal стартует с `opacity: 0.18, y: 18` и ставится сразу при монтировании всем `.vestnik-scrub` – «Разделы клуба», «Что доступно», «Три шага» стоят почти прозрачными, пока верх не дойдёт до 88 % окна (это и видно на desk_.jpg). Правило DESIGN.md 08.09 «содержание видимо до анимации» · чинить: `{ opacity: 1, y: 14 }` → `{ y: 0 }` (только transform) или минимум `opacity: 0.6`, `start: "top 92%"`, `end: "top 72%"`.
- P2 · `v2/home-motion.ts:67` + `pages/HomeV2.tsx:167,192,249` · `dependencies: []` – GSAP обходит DOM один раз, а «События», «Новости», «История» монтируются после запросов и scrub не получают. Отсюда пятнистость снимка: середина яркая, соседи бледные · чинить: `dependencies: [upcoming.length, news.data?.length, records.length]` + `ScrollTrigger.refresh()`; либо reveal в CSS + IntersectionObserver `once`.
- P2 · `v2/home-motion.ts:31–65`, `@media print` нигде нет · инлайн-стили GSAP (`opacity: .18`) уходят в печать – распечатка главной с прозрачными разделами. Без JS всё видно · чинить: `@media print { .vestnik-scrub, .vestnik-themis { opacity: 1 !important; transform: none !important } }`.
- P2 · `styles/dpo-vitrine.css:479–485, 494–497` · вход мачты `club-dpo-rise` от `opacity: 0` с `both`: H1, лид и счётчики невидимы до 560 мс, LCP-кандидат стартует непрорисованным. Противоречит DESIGN.md стр. 461 («видно с первого кадра, меняется только положение») · чинить: `from { opacity: 1; transform: translateY(10px) }`, 300 мс `var(--ease-out)`, шаг 40 мс.
- P2 · `mobile/MobileApp.tsx:919` (эквалайзер `eq 900ms infinite`), `:266` (спиннер), `:133,145` (прогресс) · анимации в инлайн-`style` у элементов без `class` – гаситель `index.css:16 [class] { animation: none }` их не достаёт, цикл идёт при `prefers-reduced-motion` · чинить: вынести в классы; спиннер оставить, эквалайзер замереть на `scaleY(.35)`.

## P3

- P3 · `v2/home-motion.ts:33–35` · Фемида scrub `0.70 → 0.82` – дельта 0.12 не читается, движение «для галочки» · либо `0.55 → 0.85`, либо снять.
- P3 · `styles/vestnik-home.css:550–559` · `vestnik-timeline-rise` от `opacity: 0` с `both`: играет при монтировании, когда история вне экрана – никто не видит, а по якорю контент скрыт · тот же scroll-триггер, старт `opacity: 1; translateX(14px)`, 360 мс.
- P3 · `mascot/crow-mascot.js:253`, `v2/home-motion.ts:8–14` · reduced-motion читается один раз, смена настройки в сессии не ловится (`CrowWelcome.tsx:15–19` делает верно) · `matchMedia(...).addEventListener('change')`.
- P3 · `mascot/crow-mascot.js:491,495` · RAF перепланируется каждый кадр и при `!visible` (tick лишь выходит) · на выходе из IO `cancelAnimationFrame`, на входе запускать снова.
- P3 · `index.css:801–802` · `:focus-within` сдвигает дату на 5 px за 240 мс – движение на клавиатурное действие (emil: не анимировать) · оставить только фон.
- P3 · `styles/vestnik-home.css:120,222,310,331,375` · hover без `(hover: hover) and (pointer: fine)` – залипает после тапа; DESIGN.md: «hover только при fine pointer» · обернуть, как в `dpo-vitrine.css:337`.
- P3 · `mobile/MobileApp.tsx:145` · прогресс анимирует `width` 1 с `cubic-bezier(.4,0,.2,1)` (layout, ease-in-out на одноразовое заполнение) · `scaleX()` от левого края, 600 мс `cubic-bezier(0.23,1,0.32,1)`; `:133` – та же кривая и 600 мс.
- P3 · `components/ClubSupportBot.tsx:108–111` · искусственные 420 мс «печатает…» перед каждым ответом при данных в памяти (apple §1: лишняя латентность на пути ввода) · 180–220 мс или только для первого ответа.
- P3 · `index.css:368` · `club-channel-in` 450 мс от `opacity: 0` – выше потолка 300 мс · 260 мс, `translateY(8px)`, `opacity: .6 → 1`.
- P3 · `styles/vestnik-home.css:56–57,163` · grain: `mix-blend-mode: multiply` на слое с бесконечным transform – возможен пересчёт композиции героя каждый кадр (проверить в профайлере, Safari); marquee не останавливается вне экрана · grain без blend; marquee – `animation-play-state` через IO.
- P3 · гигиена: `index.css:789` `.club-support-dock` hover-подъём без гейта, класс в публичном контуре не найден (проверить, мёртвое); `styles/dpo-vitrine.css:268–270` transition `box-shadow`, которого никто не меняет.

## Что хорошо

- `:active scale(.97)` 140 мс; подъём карточек и фото мерча (450 мс/1.045) строго под `hover:hover + pointer:fine + no-preference` (`index.css:574–578, 804–809`).
- Ворона: при reduced-motion RAF и слежение не стартуют; IO с `rootMargin` морозит кадры вне экрана; hide/show 220 мс на opacity/transform.
- Главная: marquee linear с паузой по hover; grain/marquee/scrub гасятся при reduced-motion (`vestnik-home.css:596–606`).
- Мобильное меню 220 мс `cubic-bezier(.16,1,.3,1)`, выход мгновенный; вкладки без анимации (`key={pathname}`) – по DESIGN.md.
- Escape и ввод нигде не ждут анимацию.

## Решения владельца

1. Бриф (стр. 22) запрещает «шум», DESIGN.md 09.09 фиксирует grain drift для «/». Оставить зерно или снять?
2. DESIGN.md стр. 147 – reduced-motion «выключает целиком», стр. 384 – «исключает перемещение». `index.css:16` гасит всё, включая цветовые кроссфейды (emil/apple их оставляют). Какой вариант?
3. Панель бота, `Modal.tsx` (события, мерч) и `Toast.tsx` появляются мгновенно. Emil: «occasional → 200–300 мс», DESIGN.md: «формы – только состояния», но это публичные поверхности. Добавить вход (панель `translateY(12px)+opacity` 220 мс, выход 160 мс; модалка `scale(.97)` 200 мс; тост 200 мс) или оставить?
4. Реплика вороны «Подсказать?» через 14 с простоя (`crow-mascot.js:497–504`) – автоматический всплывающий элемент. Оставляем или отключаем на страницах с формами?
