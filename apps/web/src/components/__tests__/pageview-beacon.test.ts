/**
 * @vitest-environment happy-dom
 */
import { act } from "react";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_CONSENT_KEY, writeCookieConsent } from "../../lib/cookie-consent.js";
import { PageViewBeacon } from "../PageViewBeacon.js";

describe("PageViewBeacon + cookie gate", () => {
  let host: HTMLDivElement;
  let root: Root;
  let sendBeacon: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    sendBeacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { configurable: true, value: sendBeacon });
    fetchMock = vi.fn(() => Promise.resolve({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    localStorage.removeItem(COOKIE_CONSENT_KEY);
    vi.unstubAllGlobals();
  });

  function mount(path = "/v2/news") {
    act(() => {
      root.render(
        createElement(MemoryRouter, { initialEntries: [path] }, createElement(PageViewBeacon)),
      );
    });
  }

  it("без согласия не шлёт маяк", () => {
    mount();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("при essential не шлёт маяк", () => {
    writeCookieConsent("essential");
    mount();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it("при all шлёт path на /api/analytics/pageview", () => {
    writeCookieConsent("all");
    mount("/v2/events");
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0]!;
    expect(url).toBe("/api/analytics/pageview");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("после события club:cookie-consent=all досылает текущий path", () => {
    mount("/v2/merch");
    expect(sendBeacon).not.toHaveBeenCalled();
    act(() => {
      writeCookieConsent("all");
    });
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
