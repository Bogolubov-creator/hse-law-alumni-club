# Внешний контур – чеклист до выдачи секретов

Код интеграции (SMTP / ЮKassa / Telegram webhook / VAPID) уже в репозитории
и включается **только** через env. До появления секретов фаза = этот чеклист,
без «фейковых» ключей в git.

## Стенс релиза (фиксируем явно)

Пока не выданы `YOOKASSA_*` и `VAPID_*`, **допустимый** прод-запуск:

| Контур | Режим без секретов | Что видит пользователь |
| --- | --- | --- |
| Оплата | ключи пусты → «заявка без оплаты» | Заявка в офис, без checkout ЮKassa |
| Web Push | VAPID пусты → пуши выключены | Подписка на пуши недоступна / кнопка скрыта |
| Telegram FAQ/office | токены пусты → канал выключен или лог | Бот и TG-office молчат; сайт FAQ работает |
| SMTP | **обязателен** на `APP_ENV=production` | Без почты fail-fast (`assertProdConfig`) |

Итоговая формулировка для приёмки: **«релиз без онлайн-оплаты и без push»** – OK при живом SMTP,
локализации БД в РФ и закрытом `SUPPORT_ENABLED`, пока оргпакет 152-ФЗ не подтверждён.
Включение ЮKassa / VAPID / Telegram – отдельный шаг после строк ниже.

## Обязательно для live (блокер прод-старта при `APP_ENV=production`)

| Секрет / параметр | Зачем | Где взять | Готово |
| --- | --- | --- | --- |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | Восстановление пароля, подтверждение email, office outbox | Утверждённый отправитель офиса (SPF/DKIM) | ☐ |
| `OFFICE_EMAIL` + `OFFICE_NOTIFY_CHANNEL=email\|both` | Письма офису о заявках (через `club_mail_outbox`) | Почта учебного офиса | ☐ |
| `PUBLIC_URL=https://…` | return_url оплаты, sitemap, canonical | Прод-домен | ☐ |
| `AUTH_SECRET`, `ADMIN_AUTH_SECRET` | JWT сессий | `openssl rand -hex 32` | ☐ |
| `DIRECTUS_SERVICE_TOKEN` | CMS API | Directus admin | ☐ |
| `CHECKOUT_DATABASE_URL` | Корзина, резерв, outbox, FAQ-hits, pageviews | Postgres | ☐ |
| `SEED_DEMO=false` (или не задан) | Иначе fail-fast на проде: демо попадёт в витрины/sitemap | env хоста | ☐ |
| `VITE_LOCAL_REVIEW` **не** `true` на сборке web | Иначе на legal – баннер «Проект юридических документов» | CI/prod build args | ☐ |

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
4. Обновить [deploy-runbook.md](deploy-runbook.md) фактическими доменами.

См. также: [152fz-compliance.md](152fz-compliance.md), [release-prep-2026-09-09.md](staged-refinement/release-prep-2026-09-09.md), [defects.md](staged-refinement/defects.md).
