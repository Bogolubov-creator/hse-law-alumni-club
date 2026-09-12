# План выключения `/legacy/*`

Канон UI на `/` (бывший v2). Soft-cutover: `/legacy/*` редиректит на канон
(`StripLegacyPrefix` в `App.tsx`). Hard-remove orphan-страниц – выполнен (10.09.2026):
удалены неиспользуемые `pages/{Home,News,NewsPost,Dpo,Program,Merch,Cart,Podcasts,Events,JoinAuth,Lk,Profile}.tsx`,
а также `LkShell` / `lk-theme` (только V1).

## Зачем ещё держим `/legacy` Navigate

| Причина | Статус |
| --- | --- |
| Закладки на `/legacy/…` | Soft-cutover: Navigate → канон |
| Откат UI | Git revert; не `/legacy` на проде |

## Этапы

### 1. Инвентаризация – done

- Было: блок `<Route path="/legacy…">` с lazy legacy-страниц.
- Сторож e2e: нет ссылок на `/legacy` с канона + тест редиректа.

### 2. Soft-cutover – done

1. `/legacy` и `/legacy/*` → `StripLegacyPrefix` (как `/v2`).
2. Lazy-импорты legacy-UI сняты с `App.tsx`.
3. Sitemap / письма – только канон.

### 3. Hard-remove – done (этот релиз)

1. Orphan page files и `LkShell` / `lk-theme` удалены.
2. React-редирект `/legacy/*` оставлен (дешёвый Navigate); опционально Caddy 301 на год – отдельно.

### 4. Критерии готовности

- [x] Нет React-маршрутов, рендерящих старый UI
- [x] Нет внутренних ссылок на `/legacy` (e2e сторож)
- [x] Закладки `/legacy/…` ведут на канон (Navigate)
- [x] Hard-remove: orphan page files удалены; опционально Caddy 301 – вне scope

## Не делать попутно

- Не смешивать с redesign / MobileApp.
- `/v2/*` редиректы оставить – дешёвые Navigate.
