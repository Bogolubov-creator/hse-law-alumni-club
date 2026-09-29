/** Выбор по cookies / локальному хранилищу (152-ФЗ, ст. 9 – свободное согласие). */

export const COOKIE_CONSENT_KEY = "club_cookie_consent";
export const COOKIE_SETTINGS_EVENT = "club:cookie-settings";

export type CookieConsent = "essential" | "all";

/** Читает сохранённый выбор. Старое значение «1» = полное согласие. */
export function readCookieConsent(): CookieConsent | null {
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (v === "1" || v === "all") return "all";
    if (v === "essential" || v === "0") return "essential";
  } catch {
    /* private mode */
  }
  return null;
}

export function hasCookieChoice(): boolean {
  return readCookieConsent() !== null;
}

/** Нужно ли включать необязательную аналитику (page-view маяк клуба). */
export function allowsOptionalCookies(): boolean {
  return readCookieConsent() === "all";
}

export function writeCookieConsent(value: CookieConsent): void {
  localStorage.setItem(COOKIE_CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent("club:cookie-consent", { detail: value }));
}

/** Открыть баннер снова из подвала / политики. */
export function openCookieSettings(): void {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
