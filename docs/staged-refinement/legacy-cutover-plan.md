# План выключения `/legacy/*`

Канон UI уже на `/` (бывший v2). Soft-cutover (10.09.2026): `/legacy/*` только
редиректит на канон (`StripLegacyPrefix` в `App.tsx`). Исходники старых страниц
ещё в `apps/web/src/pages/` (Home, Dpo, Lk, …) – hard-remove в следующем релизе.

## Зачем ещё держим файлы

| Причина | Статус |
| --- | --- |
| Сравнение / скриншоты | Исторические; e2e на каноне |
| Закладки на `/legacy/…` | Soft-cutover: Navigate → канон |
| Откат UI | Git revert; не `/legacy` на проде |

## Этапы

### 1. Инвентаризация – done

- Было: блок `<Route path="/legacy…">` с lazy legacy-страниц.
- Сторож e2e: нет ссылок на `/legacy` с канона + тест редиректа.

### 2. Soft-cutover – done (этот релиз)

1. `/legacy` и `/legacy/*` → `StripLegacyPrefix` (как `/v2`).
2. Lazy-импорты legacy-UI сняты с `App.tsx` (бандл не тянет старый UI).
3. Файлы `pages/Home.tsx`, `Dpo.tsx`, `Lk.tsx`, … пока на диске до hard-remove.
4. Sitemap / письма – только канон.

### 3. Hard-remove (следующий релиз)

1. Удалить React-редиректы **или** заменить на 301 в Caddy на год.
2. Удалить неиспользуемые `pages/{Home,News,NewsPost,Dpo,Program,Merch,Cart,Podcasts,Events,JoinAuth,Lk,Profile}.tsx` и связанные стили/тесты, если нет импортов.
3. Обновить handoff / acceptance: ссылка только сюда.

### 4. Критерии готовности

- [x] Нет React-маршрутов, рендерящих старый UI
- [x] Нет внутренних ссылок на `/legacy` (e2e сторож)
- [x] Закладки `/legacy/…` ведут на канон (Navigate)
- [ ] Hard-remove: orphan page files удалены; опционально Caddy 301

## Не делать попутно

- Не смешивать с redesign / MobileApp.
- `/v2/*` редиректы оставить – дешёвые Navigate.
