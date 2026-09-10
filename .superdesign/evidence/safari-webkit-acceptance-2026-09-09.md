# Приёмка Safari / iPhone · 10.09.2026

## Фаза 1 – зелёный критичный набор

1. Хелпер [apps/web/e2e/harness.ts](../../apps/web/e2e/harness.ts): `seedClientStorage` (`club_cookie_consent=all`, `club_pwa_dismiss=1`), `stubSw`, `preparePage`.
2. Подключён в: `public`, `a11y`, `lk-v2`, `admin`, `mobile-tabs-v2`, `pwa-shell`. Cookie-диалог в a11y / mobile-tabs отдельно – без seed.
3. `isMobile` skips: SiteShell / Vision / hero `#top` / `#kak` на MobileApp-маршрутах.
4. Скрипт: `pnpm -C apps/web e2e:safari` → safari + iphone-safari, `--workers=1`.
5. Каталог/новости в `public.spec` – stub (Safari-приёмка не зависит от падения Directus). `sitemap.xml` – skip, если CMS недоступен.

### Прогон 10.09.2026

```
E2E_BASE_URL=http://127.0.0.1:5274 pnpm -C apps/web e2e:safari
PLAYWRIGHT_BROWSERS_PATH=$HOME/Library/Caches/ms-playwright
```

Итог (~1.0 мин): **99 passed**, **21 skipped**, **0 failed**.

### Перепроверка 10.09.2026 (13:16 МСК)

Повторный `pnpm -C apps/web e2e:safari` на том же стенде `:5274`: **99 passed**, **21 skipped**, **0 failed** (~1.2 мин). Регрессий нет.

Осознанные skip: WebKit Tab / Full Keyboard Access; desktop landmarks на MobileApp; hero/якоря на iphone; sitemap без Directus.

## Чеклист физического iPhone (ещё вручную)

| Шаг | Статус |
| --- | --- |
| Открыть `PUBLIC_URL` в Safari | Pending устройство |
| Главная / ДПО / мерч / новости / ЛК | Pending |
| Add to Home Screen (PWA) | Pending |
| Cookie «Принять все» / «Только необходимые» | Pending |
| VoiceOver точечно (skip link, вкладки) | Pending |

## Архив (09.09.2026)

До харнесса: 46 passed / 14 skipped / 60 failed (~28 мин, workers=2) – cookie-баннер, MobileApp vs desktop a11y, параллель.
