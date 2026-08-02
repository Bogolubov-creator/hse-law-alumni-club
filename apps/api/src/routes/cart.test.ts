import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { cartRoutes } = await import("./cart.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { MAX_CART_LINES, MAX_LINE_QTY } = await import("@club/shared");

const SESSION = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(cartRoutes);
  return app;
}

const add = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: "POST", url: "/cart", headers: { "x-cart-session": SESSION }, payload });

const read = (app: FastifyInstance) =>
  app.inject({ method: "GET", url: "/cart", headers: { "x-cart-session": SESSION } });

beforeEach(() => {
  resetDb({
    products: [
      { id: "p1", slug: "robe", title: "Мантия", price: 690000, stock: 5, status: "published",
        variants_json: [{ sku: "robe-M", stock: 3 }, { sku: "robe-L", stock: 2 }] },
      { id: "p2", slug: "pin", title: "Значок", price: 50000, stock: 100, status: "published", variants_json: null },
    ],
    programs: [{ id: "d1", slug: "ip-law", title: "Право ИС", price: 1200000, status: "published", enrollment: "actual", source_url: null }],
    carts: [],
  });
});

describe("POST /cart – вариант товара сверяется с каталогом", () => {
  it("выдуманный SKU отклоняется", async () => {
    const app = await build();
    const r = await add(app, { type: "merch", ref_id: "robe", variant_sku: "robe-XXXL", qty: 1 });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/варианта товара нет/i);
    // В корзину ничего не попало – иначе заявка ушла бы с несуществующим размером.
    expect(db.carts ?? []).toHaveLength(0);
  });

  it("товар с размерами требует выбора варианта", async () => {
    const app = await build();
    const r = await add(app, { type: "merch", ref_id: "robe", qty: 1 });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/выберите вариант/i);
  });

  it("валидный вариант принимается", async () => {
    const app = await build();
    const r = await add(app, { type: "merch", ref_id: "robe", variant_sku: "robe-M", qty: 2 });
    expect(r.statusCode).toBe(200);
    expect(r.json().count).toBe(2);
  });

  it("товару без вариантов вариант передавать нельзя", async () => {
    const app = await build();
    const r = await add(app, { type: "merch", ref_id: "pin", variant_sku: "выдумка", qty: 1 });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/нет вариантов/i);
  });

  it("товар без вариантов кладётся без SKU", async () => {
    const app = await build();
    const r = await add(app, { type: "merch", ref_id: "pin", qty: 1 });
    expect(r.statusCode).toBe(200);
  });
});

describe("POST /cart – границы количества и числа позиций", () => {
  it("повторные добавления не превышают потолок количества", async () => {
    const app = await build();
    for (let i = 0; i < 4; i++) await add(app, { type: "merch", ref_id: "robe", variant_sku: "robe-M", qty: 99 });
    const items = (await read(app)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(MAX_LINE_QTY);
  });

  it("новая позиция сверх потолка отклоняется явной ошибкой, а не молча", async () => {
    const app = await build();
    // Забиваем корзину до предела разными «значками» – у товара без вариантов
    // разные строки не создать, поэтому используем разные ref_id из каталога.
    for (let i = 0; i < MAX_CART_LINES; i++) {
      db.products!.push({ id: `x${i}`, slug: `sku-${i}`, title: `Товар ${i}`, price: 1000, stock: 10, status: "published", variants_json: null });
      await add(app, { type: "merch", ref_id: `sku-${i}`, qty: 1 });
    }
    db.products!.push({ id: "over", slug: "over", title: "Лишний", price: 1000, stock: 10, status: "published", variants_json: null });
    const r = await add(app, { type: "merch", ref_id: "over", qty: 1 });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toMatch(/уже 30 позиций/i);
    expect((await read(app)).json().items).toHaveLength(MAX_CART_LINES);
  });

  it("докладывать уже лежащую позицию можно и на потолке", async () => {
    const app = await build();
    for (let i = 0; i < MAX_CART_LINES; i++) {
      db.products!.push({ id: `y${i}`, slug: `full-${i}`, title: `Т${i}`, price: 1000, stock: 10, status: "published", variants_json: null });
      await add(app, { type: "merch", ref_id: `full-${i}`, qty: 1 });
    }
    const r = await add(app, { type: "merch", ref_id: "full-0", qty: 3 });
    expect(r.statusCode).toBe(200);
    const line = (await read(app)).json().items.find((i: any) => i.ref_id === "full-0");
    expect(line.qty).toBe(4);
  });
});

describe("POST /cart – прежние правила ДПО не сломаны", () => {
  it("повторное добавление программы не увеличивает количество", async () => {
    const app = await build();
    await add(app, { type: "dpo", ref_id: "ip-law", qty: 1 });
    await add(app, { type: "dpo", ref_id: "ip-law", qty: 1 });
    const items = (await read(app)).json().items;
    expect(items).toHaveLength(1);
    expect(items[0].qty).toBe(1);
  });

  it("несуществующая позиция – 404", async () => {
    const app = await build();
    const r = await add(app, { type: "merch", ref_id: "нет-такого", qty: 1 });
    expect(r.statusCode).toBe(404);
  });

  it("без сессии корзины – 400", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/cart", payload: { type: "merch", ref_id: "pin", qty: 1 } });
    expect(r.statusCode).toBe(400);
  });
});
