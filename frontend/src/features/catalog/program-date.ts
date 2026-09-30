/** ISO-даты показываем по Москве; текстовое расписание CMS сохраняем без выдуманной даты. */
export function programStart(value?: string | null): string {
  if (!value?.trim()) return "Уточняется";
  if (!/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) || !Number.isFinite(Date.parse(value))) return value;
  return new Date(value).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" });
}
