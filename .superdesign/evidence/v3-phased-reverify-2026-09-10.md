# Перепроверка V3 phased plan · 10.09.2026

Правило: одна фаза → проверка → фиксация. Ниже – повторная приёмка уже залитого кода.

| Фаза | Критерий | Результат |
| --- | --- | --- |
| 1 Safari e2e | `pnpm -C apps/web e2e:safari` → 0 failed | **99 passed / 21 skipped / 0 failed** (повтор ~13:16) |
| 2 UX/техдолг | моки достижений 16; comps/отчёты не в git | `ACH_N=16`; gitignore на `docs/report-assets/`, `vestnik-*.html` |
| 3 Ops | TTL + outbox | unit gates OK; **checkout.integration 7/7** (вкл. `expired`); smoke outbox → `pending` |
| 4 Analytics/FAQ | by-day + gap counters | `admin-analytics` unit OK; `POST /support/faq-event` → строка в `club_faq_events` |
| 5 External keys | чеклист без секретов в репо | [external-keys-checklist.md](../../docs/external-keys-checklist.md); совпадает с `assertProdConfig` (+ `SEED_DEMO`) |

Миграция на стенде: `club_faq_events`, `club_mail_outbox` на `alumni_staged` (:33317).
