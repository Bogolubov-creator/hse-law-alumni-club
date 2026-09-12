/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { ResetV2 } from "../JoinAuthV2.js";
const api = vi.hoisted(() => ({ post: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("../../lib/api.js", () => ({ apiPost: api.post }));
vi.mock("../../lib/title.js", () => ({ useHead: () => {} }));
vi.mock("../../v2/Shell.js", () => ({ V2Shell: ({ children }: { children: ReactNode }) => children, mono: {}, disp: {} }));
it.each(["/podcasts#podcast-subscription", "https://example.com", ""])("возврат после смены пароля: %s", async next => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div"); const root = createRoot(host);
  api.post.mockResolvedValue({ ok: true });
  try {
    act(() => root.render(createElement(MemoryRouter, { initialEntries: [`/reset?token=test-only-token&next=${encodeURIComponent(next)}`] }, createElement(ResetV2))));
    const fields = host.querySelectorAll("input");
    for (const input of fields) {
      act(() => { input.value = "test-only-password"; Simulate.change(input); });
    }
    await act(async () => { Simulate.submit(host.querySelector("form")!); });
    expect(host.textContent).toContain("Пароль обновлён");
    const login = [...host.querySelectorAll("a")].find(a => a.textContent === "Войти в кабинет");
    expect(login?.getAttribute("href")).toBe(next === "/podcasts#podcast-subscription" ? "/lk?next=%2Fpodcasts%23podcast-subscription" : "/lk");
  } finally { act(() => root.unmount()); }
});
