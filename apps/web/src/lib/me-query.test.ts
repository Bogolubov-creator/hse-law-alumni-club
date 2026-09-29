/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useMemberDiscount } from "./cart.js";
import { useMe } from "./queries.js";

it("профиль и скидка делят запрос, обновление и изолированный кеш нового пользователя", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.setItem("club_token", "first");
  let discount = 15;
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
    alumni: { fio: null, cohort: null, verification_status: "verified" },
    level: { points: 500, level: "expert", level_title: "Знаток", discount, next_level: "ambassador", to_next: 500 },
    achievements: [], activity: [],
  })));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  const host = document.createElement("div");
  const root = createRoot(host);
  function Consumer() {
    const profile = useMe(localStorage.getItem("club_token"));
    const value = useMemberDiscount();
    return createElement("output", null, `${profile.data?.level.discount ?? 0}/${value}`);
  }
  const render = () => root.render(createElement(QueryClientProvider, { client }, createElement(Consumer)));
  const settle = () => new Promise(resolve => setTimeout(resolve, 30));
  try {
    await act(async () => { render(); await settle(); });
    await act(settle);
    expect(host.textContent).toBe("15/15");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    discount = 20;
    await act(async () => { await client.invalidateQueries({ queryKey: ["me"] }); await settle(); });
    expect(host.textContent).toBe("20/20");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    localStorage.removeItem("club_token");
    await act(async () => { render(); await settle(); });
    expect(host.textContent).toBe("0/0");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    localStorage.setItem("club_token", "second");
    discount = 0;
    await act(async () => { render(); await settle(); });
    await act(settle);
    expect(host.textContent).toBe("0/0");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.at(-1)?.[1]).toEqual({ headers: { accept: "application/json", authorization: "Bearer second" } });
  } finally {
    act(() => root.unmount());
    client.clear(); localStorage.clear(); vi.unstubAllGlobals();
  }
});
