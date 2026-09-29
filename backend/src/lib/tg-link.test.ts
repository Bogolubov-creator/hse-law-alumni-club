import { expect, it, vi } from "vitest";
const { query } = vi.hoisted(() => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock("./checkout-store.js", async () => ({
  checkoutPool: () => ({ query }), digest: (s: string) => s.split("").reverse().join(""),
}));
import { makeTgLinkCode, consumeTgLinkCode } from "./tg-link.js";
it("случайный код укладывается в Telegram; в хранилище только хеш", async () => {
  const a = await makeTgLinkCode("owner"), b = await makeTgLinkCode("owner");
  expect(a).toMatch(/^l[A-Za-z0-9_-]{32}$/); expect(a).not.toBe(b);
  expect(JSON.stringify(query.mock.calls)).not.toContain(a);
});
it("старые бессрочные коды и неверные Telegram ID отклоняются до БД", async () => {
  expect(await consumeTgLinkCode("l" + "x".repeat(38), "42")).toBeNull();
  expect(await consumeTgLinkCode("l" + "x".repeat(32), "-42")).toBeNull();
});
