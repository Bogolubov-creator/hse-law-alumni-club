# Подготовка к публикации · V3 cutover + подкасты · 09.09.2026

Локальная готовность к публикации (вариант B). **Production deploy и push live-ключей не выполнялись.**

## Что готово локально

- Канон UI на `/` (ветка `codex/v3`), `/v2/*` → редирект, legacy под `/legacy/*`
- 7 выпусков «Правовая грамотность» в Directus стенда `alumni-staged-comparison` (том uploads, не в git)
- Пробный: Данюков; остальные по подписке
- Admin API принимает UUID файла Directus в `audio_url` (+ `video_url`)
- E2E канона: sections / join-legal / mobile-tabs / crow – **50 passed** (desktop)
- Unit: shared 68, api 226 (+13 skip)
- Typecheck shared/web/api – ок
- Smoke: `GET /podcasts` = 7, Range 206 на free audio через preview

## Перед production deploy

1. `SEED_DEMO=false` в prod `.env`
2. SMTP / ЮKassa / Telegram / Web Push – только с реальными секретами; до этого – deferred
3. Перенести аудио: повторный `load-pravovaya-gramotnost` на prod Directus **или** дамп тома `directus_uploads` + строки `podcasts` (см. [deploy-runbook](../deploy-runbook.md) §«Контент, которого нет в репозитории»)
4. Проверить sitemap/robots с `/podcasts`, канонические URL без `/v2`
5. Не коммитить mp3, `.env`, `local-access.txt`, манифесты evidence с путями Downloads

## Запуск локальной загрузки аудио

```sh
# только http://127.0.0.1:8255
node /Users/macbook/alumni-staged-evidence/run-local.cjs \
  pnpm --filter @club/scripts run load-pravovaya-gramotnost
```

Манифест вне git: `/Users/macbook/alumni-staged-evidence/pravovaya-gramotnost-manifest.json`.

## Не блокер локальной готовности / блокер live

SMTP, ЮKassa, Telegram notify, Web Push, Safari/устройство, полный matrix Playwright, утверждение визуала владельцем.
