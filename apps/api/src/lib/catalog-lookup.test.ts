import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("./directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
const { resetDb, directusModuleMock } = await import("../test/fake-directus.js");
const { lookupCatalog, lookup } = await import("./catalog-lookup.js");
beforeEach(() => resetDb({
  programs: [{ slug: "shared", title: "Право", price: 120000, status: "published", enrollment: "actual" }],
  products: [{ slug: "shared", title: "Мантия", price: 90000, status: "published", stock: 5, variants_json: [{ sku: "M", stock: 2 }] }, { slug: "hidden", status: "draft" }],
}));
it("две коллекции читаются по одному разу, варианты и повторные строки не добавляют запросов", async () => {
  const spy = vi.spyOn(directusModuleMock.directus, "request");
  try {
    const rows = await lookupCatalog([{ type: "dpo", ref_id: "shared" }, { type: "merch", ref_id: "shared" }, { type: "merch", ref_id: "shared" }, { type: "merch", ref_id: "hidden" }]);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(rows.size).toBe(2);
    expect(rows.get("dpo:shared")).toMatchObject({ title: "Право", price: 120000 });
    expect(rows.get("merch:shared")).toMatchObject({ title: "Мантия", stock: 5, variants: [{ sku: "M", stock: 2 }] });
  } finally { spy.mockRestore(); }
});
it("пустой список не читает БД, отсутствующая позиция возвращает null", async () => {
  const spy = vi.spyOn(directusModuleMock.directus, "request");
  try { expect((await lookupCatalog([])).size).toBe(0); expect(spy).not.toHaveBeenCalled(); expect(await lookup("merch", "missing")).toBeNull(); }
  finally { spy.mockRestore(); }
});
