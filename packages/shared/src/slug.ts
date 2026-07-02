// Транслитерация кириллицы в url-slug — единая для админки и синка каталога.
const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "j",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugifyRu(s: string): string {
  return s.toLowerCase()
    .replace(/[а-яё]/g, (ch) => TR[ch] ?? "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || `item-${Math.abs(hash(s))}`;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

/**
 * Нормализация названия для сопоставления: регистр, «ё», пробелы,
 * латинский дубль — и после « / », и хвостом в скобках «(Le français …)».
 */
export function normalizeTitle(s: string): string {
  return s.split(" / ")[0]!
    .replace(/\s*\([^)]*\)\s*$/, "")
    .toLowerCase().replace(/[ё]/g, "е").replace(/\s+/g, " ").trim();
}
