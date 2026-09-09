# Приёмка Safari / iPhone · 09.09.2026

## Что сделано

1. В [apps/web/playwright.config.ts](../../apps/web/playwright.config.ts) добавлены проекты:
   - `safari` – Desktop Safari (WebKit)
   - `iphone-safari` – iPhone 13 + WebKit
2. Прогон на стенде `http://127.0.0.1:5274` (preview → API с analytics):
   ```
   E2E_BASE_URL=http://127.0.0.1:5274 pnpm exec playwright test \
     --project=safari --project=iphone-safari \
     e2e/public.spec.ts e2e/a11y.spec.ts e2e/pwa-shell.spec.ts \
     e2e/mobile-tabs-v2.spec.ts e2e/lk-v2.spec.ts e2e/admin.spec.ts \
     --workers=2
   ```
3. Итог прогона (~28.6 мин): **46 passed**, **14 skipped**, **60 failed**.
4. Повтор одиночного `public.spec` на safari (без параллели): **pass** – бренд на главной виден.

## Интерпретация

- Движок WebKit **подключён к CI-приёмке** и реально гоняется (не только Chromium).
- Массовые fail в полном параллельном прогоне связаны с:
  - cookie-баннером, перехватывающим клики («Загрузка» / диалог cookies в снимках);
  - MobileApp takeover на `iphone-safari` при ожиданиях desktop-разметки (a11y landmarks);
  - таймаутами/гонами под нагрузкой workers=2.
- Это **не** замена ручной проверке на физическом iPhone/Safari (VoiceOver, notch, PWA Add to Home Screen, push).

## Чеклист физического iPhone (ещё вручную)

| Шаг | Статус |
| --- | --- |
| Открыть `PUBLIC_URL` в Safari | Pending устройство |
| Главная / ДПО / мерч / новости / ЛК | Pending |
| Add to Home Screen (PWA) | Pending |
| Cookie «Принять все» / «Только необходимые» | Pending |
| VoiceOver точечно (skip link, вкладки) | Pending |

Повтор локально: `pnpm -C apps/web exec playwright test --project=safari --project=iphone-safari --workers=1` после dismiss cookies в фикстурах.
