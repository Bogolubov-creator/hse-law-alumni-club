/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  COOKIE_CONSENT_KEY,
  allowsOptionalCookies,
  hasCookieChoice,
  readCookieConsent,
  writeCookieConsent,
} from "../cookie-consent.js";

describe("cookie-consent", () => {
  afterEach(() => {
    localStorage.removeItem(COOKIE_CONSENT_KEY);
  });

  it("читает старое значение 1 как all", () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "1");
    expect(readCookieConsent()).toBe("all");
    expect(allowsOptionalCookies()).toBe(true);
  });

  it("сохраняет только необходимые", () => {
    writeCookieConsent("essential");
    expect(hasCookieChoice()).toBe(true);
    expect(readCookieConsent()).toBe("essential");
    expect(allowsOptionalCookies()).toBe(false);
  });
});
