export const COOKIE_CONSENT_KEY = "club_cookie_consent";
export const COOKIE_SETTINGS_EVENT = "club:cookie-settings";

export type CookieConsent = "essential" | "all";

export function readCookieConsent(): CookieConsent | null {
  try {
    const v = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (v === "1" || v === "all") return "all";
    if (v === "essential" || v === "0") return "essential";
  } catch {
    // Хранилище может быть запрещено настройками браузера.
  }
  return null;
}

export function hasCookieChoice(): boolean {
  return readCookieConsent() !== null;
}

export function allowsOptionalCookies(): boolean {
  return readCookieConsent() === "all";
}

export function writeCookieConsent(value: CookieConsent): void {
  localStorage.setItem(COOKIE_CONSENT_KEY, value);
  window.dispatchEvent(new CustomEvent("club:cookie-consent", { detail: value }));
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
