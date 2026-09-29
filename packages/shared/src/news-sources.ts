export const NEWS_SOURCES = [
  { id: "alumni", title: "Выпускники ВШЭ", url: "https://pravo.hse.ru/businessandlaw/alumni" },
  { id: "career", title: "Карьера и работодатели", url: "https://pravo.hse.ru/businessandlaw/career" },
  { id: "telegram", title: "Telegram клуба", url: "https://t.me/s/AlumniLawHSE" },
] as const;
export type NewsSourceId = typeof NEWS_SOURCES[number]["id"];
export function canonicalNewsUrl(raw: string): string | null {
  const clean = raw.split(/[?#]/)[0] || "";
  if (/^https:\/\/pravo\.hse\.ru\/news\/\d+\.html$/.test(clean)) return clean;
  const match = /^https:\/\/t\.me\/(?:s\/)?AlumniLawHSE\/(\d+)$/i.exec(clean);
  return match ? `https://t.me/AlumniLawHSE/${match[1]}` : null;
}
export function newsSourceLabel(url: string): string {
  return url.startsWith("https://t.me/") ? "Telegram клуба" : "Факультет права НИУ ВШЭ";
}
