/** @vitest-environment happy-dom */
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useProgramMutations, useMemberMutations } from "./admin.js";

it("сохранение программы обновляет каталог и детали, сохраняя кеш несвязанных разделов", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response('{"ok":true}')));
  const qc = new QueryClient();
  const keys = [["adm", "programs"], ["adm", "overview"], ["adm", "audit"], ["adm", "analytics", "7d"], ["programs"], ["program", "example"], ["adm", "orders"], ["adm", "members"], ["adm", "page", "home"], ["adm", "events"]];
  for (const key of keys) qc.setQueryData(key, []);
  const root = createRoot(document.createElement("div"));
  let change!: () => Promise<unknown>;
  let anonymize!: () => Promise<unknown>;
  function Consumer() {
    const programs = useProgramMutations(); const members = useMemberMutations();
    change = () => programs.patchProgram.mutateAsync({ id: "p1", title: "Новое название" });
    anonymize = () => members.anonymizeMember.mutateAsync("m1");
    return null;
  }
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client: qc }, createElement(Consumer))));
    await act(async () => { await change(); });
    expect(keys.map(key => qc.getQueryState(key)?.isInvalidated)).toEqual([true, true, true, true, true, true, false, false, false, false]);
    await act(async () => { await anonymize(); });
    expect(qc.getQueryState(["adm", "orders"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["adm", "events"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["adm", "page", "home"])?.isInvalidated).toBe(false);
  } finally { act(() => root.unmount()); qc.clear(); vi.unstubAllGlobals(); }
});
