/** @vitest-environment happy-dom */
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HomeV2 from "../HomeV2.js";

const state = vi.hoisted(() => ({
  discount: 0,
  events: [] as Array<{ id: string; title: string; starts_at: string; location: string | null; format: "online" | "offline" }>,
  eventsPending: false,
  eventsError: false,
  programsPending: false,
  programsError: false,
}));
vi.mock("../../lib/cart.js", () => ({
  token: () => null,
  useMemberDiscount: () => state.discount,
  usePrograms: () => ({
    data: state.programsPending || state.programsError ? undefined : [{ slug: "copyright", title: "Авторское право", direction: "Право", price: 7500000, cover: "/covers/472681893.jpg", enrollment: "actual" }],
    isPending: state.programsPending,
    isError: state.programsError,
    refetch: () => {},
  }),
}));
// Список событий и архив имеют разные контракты данных.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === "events" && !state.eventsPending && !state.eventsError ? state.events : undefined,
    isPending: state.eventsPending,
    isError: state.eventsError,
    refetch: () => {},
  }),
}));
vi.mock("../../lib/queries.js", () => ({ usePage: () => ({}), useNewsList: () => ({ data: [] }), formatNewsDate: () => "" }));
vi.mock("../../lib/title.js", () => ({ useHead: () => {} }));
vi.mock("../../v2/Shell.js", () => ({ V2Shell: ({ children }: { children: ReactNode }) => children, text: (value: string, fallback: string) => value || fallback }));

function withHome(check: (host: HTMLElement) => void) {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    act(() => root.render(createElement(MemoryRouter, null, createElement(HomeV2))));
    check(host);
  } finally {
    act(() => root.unmount());
  }
}

describe("Главная клуба", () => {
  beforeEach(() => {
    state.discount = 0;
    state.events = [];
    state.eventsPending = false;
    state.eventsError = false;
    state.programsPending = false;
    state.programsError = false;
  });

  it.each([
    [0, "75 000 ₽"],
    [5, "71 250 ₽"],
    [10, "67 500 ₽"],
    [25, "56 250 ₽"],
  ])("при скидке %i%% показывает %s", (discount, expected) => {
    state.discount = discount;
    withHome((host) => {
      expect(host.querySelector(".home-dpo__price")?.textContent?.replace(/\s/g, " ")).toBe(expected);
      expect(host.querySelector(".home-dpo__item")?.getAttribute("href")).toBe("/dpo/copyright");
      expect(host.querySelector(".home-dpo__price-label")?.textContent).toBe(discount > 0 ? "Цена выпускника" : "Базовая цена");
      expect(host.querySelector("#home-dpo-title")?.textContent).toBe(discount > 0 ? "Программы ДПО с ценой выпускника" : "Программы ДПО факультета права");
      if (discount > 0) expect(host.querySelector(".home-dpo__head")?.textContent).toContain(`Скидка ${discount}% уже учтена`);
    });
  });

  it("показывает месяц в родительном падеже рядом с днём встречи", () => {
    state.events = [{ id: "event-1", title: "Встреча выпусков", starts_at: "2099-10-02T16:00:00.000Z", location: null, format: "online" }];
    withHome((host) => {
      expect(host.querySelector(".home-agenda__item time")?.textContent).toContain("2октября · 19:00");
    });
  });

  it("не выдаёт загрузку афиши за отсутствие встреч", () => {
    state.eventsPending = true;
    state.programsPending = true;
    withHome((host) => {
      expect(host.querySelector(".home-agenda__empty")?.textContent).toBe("Загружаем афишу…");
      expect(host.textContent).not.toContain("Афиша на ближайшие недели формируется");
      expect(host.querySelector(".home-dpo__status")?.textContent).toBe("Загружаем программы…");
    });
  });

  it("отличает ошибку загрузки от пустой афиши", () => {
    state.eventsError = true;
    state.programsError = true;
    withHome((host) => {
      expect(host.querySelector(".home-agenda__empty")?.textContent).toBe("Не удалось загрузить ближайшие встречи.");
      expect(host.querySelector(".home-dpo__status")?.textContent).toContain("Не удалось загрузить программы.");
      expect(host.querySelectorAll('button[type="button"]')).toHaveLength(2);
    });
  });
});
