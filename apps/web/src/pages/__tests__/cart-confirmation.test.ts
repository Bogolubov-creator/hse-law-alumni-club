/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Submitted } from "../CartV2.js";

vi.mock("../../v2/Shell.js", () => ({
  V2Shell: ({ children }: { children: ReactNode }) => children,
  ShowcaseHead: () => null, mono: {}, disp: {}, pageTitle: {},
}));

it.each([false, true])("подтверждение заявки: вход выполнен %s", (authed) => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  if (authed) localStorage.setItem("club_token", "test-session");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(MemoryRouter, null, createElement(Submitted, {
      result: { number: "ALU-2026-000003", status: "new", subtotal: 420000, total_estimate: 420000,
        member_discount: 0, notified: { channel: "email", ok: true } },
    }))));
    expect(document.activeElement).toBe(host.querySelector("h1"));
    expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    expect(host.textContent).not.toContain("в работе у учебного офиса");
    if (authed) {
      expect(host.textContent).toContain("Следить за статусом");
      expect(host.querySelector('a[href="/lk?section=orders"]')).not.toBeNull();
    } else {
      expect(host.textContent).toContain("в кабинете она не отображается");
      expect(host.querySelector('a[href="/lk?section=orders"]')).toBeNull();
    }
  } finally {
    act(() => root.unmount()); host.remove(); localStorage.clear(); scroll.mockRestore();
  }
});

it("не показывает кнопку оплаты для HTTP-ссылки", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(MemoryRouter, null, createElement(Submitted, {
      result: { number: "ALU-2026-000004", status: "new", subtotal: 420000, total_estimate: 420000,
        member_discount: 0, notified: { channel: "email", ok: true }, payment_url: "http://provider.test/pay" },
    }))));
    expect(host.textContent).not.toContain("Оплатить через ЮKassa");
    expect(host.textContent).not.toContain("Платёж защищён");
  } finally {
    act(() => root.unmount()); host.remove(); scroll.mockRestore();
  }
});

it("показывает отметку о TLS только для HTTPS-страницы и HTTPS-ссылки", () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const previousUrl = window.location.href;
  const happyDOM = (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM;
  happyDOM.setURL("https://club.example.ru/cart");
  const scroll = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(MemoryRouter, null, createElement(Submitted, {
      result: { number: "ALU-2026-000005", status: "new", subtotal: 420000, total_estimate: 420000,
        member_discount: 0, notified: { channel: "email", ok: true }, payment_url: "https://yookassa.test/pay/new" },
    }))));
    expect(host.querySelector('a[href="https://yookassa.test/pay/new"]')).not.toBeNull();
    expect(host.textContent).toContain("Платёж защищён по протоколу SSL/TLS");
  } finally {
    act(() => root.unmount()); host.remove(); scroll.mockRestore();
    happyDOM.setURL(previousUrl);
  }
});
