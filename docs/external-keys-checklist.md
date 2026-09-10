# Внешний контур – чеклист до выдачи секретов

Код интеграции (SMTP / ЮKassa / Telegram webhook / VAPID) уже в репозитории
и включается **только** через env. До появления секретов фаза = этот чеклист,
без «фейковых» ключей в git.

## Обязательно для live (блокер прод-старта при `APP_ENV=production`)

| Секрет / параметр | Зачем | Где взять | Готово |
| --- | --- | --- | --- |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Восстановление пароля, подтверждение email, office outbox | Утверждённый отправитель офиса (SPF/DKIM) | ☐ |
| `OFFICE_EMAIL` + `OFFICE_NOTIFY_CHANNEL=email\|both` | Письма офису о заявках (через `club_mail_outbox`) | Почта учебного офиса | ☐ |
| `PUBLIC_URL=https://…` | return_url оплаты, sitemap, canonical | Прод-домен | ☐ |
| `AUTH_SECRET`, `ADMIN_AUTH_SECRET` | JWT сессий | `openssl rand -hex 32` | ☐ |
| `DIRECTUS_SERVICE_TOKEN` | CMS API | Directus admin | ☐ |
| `CHECKOUT_DATABASE_URL` | Корзина, резерв, outbox, FAQ-hits | Postgres | ☐ |
| `SEED_DEMO=false` (или не задан) | Иначе fail-fast на проде: демо попадёт в витрины/sitemap | env хоста | ☐ |

## Опционально (включаются по мере выдачи)

| Секрет | Зачем | Готово |
| --- | --- | --- |
| `YOOKASSA_SHOP_ID` + `YOOKASSA_SECRET_KEY` | Оплата sandbox → бой | ☐ |
| Webhook ЮKassa на `https://…/api/payments/yookassa` | Подтверждение оплаты | ☐ |
| `TELEGRAM_BOT_TOKEN` + `TELEGRAM_WEBHOOK_SECRET` (или `TELEGRAM_POLLING=true` на стенде) | FAQ-бот и команды | ☐ |
| `OFFICE_TG_BOT_TOKEN` + `OFFICE_TG_CHAT_ID` | Уведомления офису в TG (без ПДн заявителя) | ☐ |
| `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` | Web Push | ☐ |
| `SENTRY_DSN` | Ошибки | ☐ |

## После выдачи

1. Положить секреты **только** в env хоста / secrets store – не в репозиторий.
2. Прогнать fail-fast: `APP_ENV=production` старт API без плейсхолдеров.
3. Smoke: регистрация → письмо; заявка → office outbox; (если ЮKassa) sandbox оплата.
4. Обновить [deploy-runbook.md](../deploy-runbook.md) фактическими доменами.

См. также: [release-prep-2026-09-09.md](./staged-refinement/release-prep-2026-09-09.md), [defects.md](./staged-refinement/defects.md).
