/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import HomeV2 from "../HomeV2.js";

const state = vi.hoisted(() => ({ discount: 0 }));
vi.mock("../../lib/cart.js", () => ({
  token: () => null,
  useMemberDiscount: () => state.discount,
  usePrograms: () => ({ data: [{ slug: "copyright", title: "Авторское право", direction: "Право", price: 7500000, cover: "/covers/472681893.jpg", enrollment: "actual" }] }),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [] }) }));
vi.mock("../../lib/queries.js", () => ({ usePage: () => ({}), useNewsList: () => ({ data: [] }), formatNewsDate: () => "" }));
vi.mock("../../lib/title.js", () => ({ useHead: () => {} }));
vi.mock("../../v2/Shell.js", () => ({ V2Shell: ({ children }: { children: ReactNode }) => children, text: (value: string, fallback: string) => value || fallback }));

describe("Цена ДПО на главной", () => {
  it.each([
    [0, "75 000 ₽"],
    [5, "71 250 ₽"],
    [10, "67 500 ₽"],
    [25, "56 250 ₽"],
  ])("при скидке %i%% показывает %s", (discount, expected) => {
    state.discount = discount;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      act(() => root.render(createElement(MemoryRouter, null, createElement(HomeV2))));
      expect(host.querySelector(".home-dpo__price")?.textContent?.replace(/\s/g, " ")).toBe(expected);
      expect(host.querySelector(".home-dpo__item")?.getAttribute("href")).toBe("/dpo/copyright");
      if (discount > 0) expect(host.querySelector(".home-dpo__head")?.textContent).toContain(`Скидка ${discount}% уже учтена`);
    } finally {
      act(() => root.unmount());
    }
  });
});
