import { expect, it, vi } from "vitest";
import { collectDpoSyncCards, planDpoSync, type TaggedCard, type ExistingDpoProgram } from "./dpo-sync.js";
const card: TaggedCard = { hseId: "1234", url: "https://www.hse.ru/edu/dpo/1234/", title: "Право", category: "Право", type: "ПК", format: "online", formatRaw: "Онлайн", start: null, duration: null, priceKop: 0, enrollment: "actual" };
const program: ExistingDpoProgram = { id: "p", slug: "manual-slug", title: "Право", status: "published", source_url: card.url, price: 500, duration: "Год" };
it("план сохраняет ручную цену, slug и пропущенные поля; не мутирует вход", () => {
  const rows = [Object.freeze(program)];
  const result = planDpoSync([Object.freeze(card)], rows);
  expect(result).toEqual([{ kind: "update", id: "p", data: { format: "online", document: "Удостоверение о повышении квалификации НИУ ВШЭ", source_url: card.url, hse_id: "1234", enrollment: "actual", status: "published" } }]);
  expect(rows[0]).toBe(program);
});
it("архивирует только управляемые пропавшие строки и сохраняет уникальные slug новых", () => {
  const result = planDpoSync([{ ...card, hseId: "5678", title: "Новое", url: "https://www.hse.ru/edu/dpo/5678/" }], [program, { ...program, id: "manual", source_url: null, slug: "novoe" }]);
  expect(result).toHaveLength(2);
  expect(result[0]).toMatchObject({ kind: "create", data: { slug: "novoe-5678", status: "draft" } });
  expect(result[1]).toEqual({ kind: "archive", id: "p", data: { status: "archived" } });
});
it("не допускает планирование при неполном полном каталоге", async () => {
  const collect = vi.fn().mockResolvedValueOnce([card, card, card]).mockResolvedValueOnce([card]);
  await expect(collectDpoSyncCards({ actual: "actual", all: "all" }, async () => "", collect)).rejects.toThrow("синк отменён");
});
