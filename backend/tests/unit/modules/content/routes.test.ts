import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";

vi.mock("../../../../src/db/data.js", async () => (await import("../../../helpers/fake-data.js")).dataModuleMock);

const { resetDb } = await import("../../../helpers/fake-data.js");
const { contentRoutes } = await import("../../../../src/modules/content/routes.js");
const { env } = await import("../../../../src/config/env.js");

const PROGRAM_SLUG = "avtorskoe-pravo-v-informatsionnom-obschestve-472681893";
const PRODUCT_SLUG = "hoodie-faculty";
const initialEnvironment = { APP_ENV: env.APP_ENV, SEED_DEMO: env.SEED_DEMO };
let app: FastifyInstance;

const program = (fields: Record<string, unknown> = {}) => ({
  id: "program-1", slug: PROGRAM_SLUG, title: "Программа из базы", status: "published",
  direction: "Право", format: "online", duration: "16 часов", price: 100_000,
  enrollment: "actual", dates: null, document: "Удостоверение", description: "",
  cover: null, tagline: "", source_url: null, hse_id: "", modules: [], teachers: null,
  audience: [], results: null, advantages: [], ...fields,
});

const product = (fields: Record<string, unknown> = {}) => ({
  id: "product-1", slug: PRODUCT_SLUG, title: "Товар из базы", status: "published",
  category: "Одежда", price: 10_000, images: [], variants_json: [], stock: 0,
  description: "Описание из базы", ...fields,
});

beforeEach(async () => {
  env.APP_ENV = "production";
  env.SEED_DEMO = "false";
  resetDb();
  app = Fastify();
  await app.register(contentRoutes);
});

afterEach(async () => {
  await app.close();
  Object.assign(env, initialEnvironment);
});

describe("Публичный каталог – опубликованные данные без подстановки сидов", () => {
  it.each(["/programs", `/programs/${PROGRAM_SLUG}`])("%s сохраняет пустые поля известного slug", async (url) => {
    resetDb({ programs: [program()] });
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    const row = url === "/programs" ? response.json()[0] : response.json();
    expect(row).toMatchObject({
      id: "program-1", slug: PROGRAM_SLUG, price: 100_000,
      description: "", cover: null, tagline: "", source_url: null, hse_id: "",
    });
    if (url !== "/programs") {
      expect(row).toMatchObject({ modules: [], teachers: null, audience: [], results: null, advantages: [] });
    }
    expect(row).not.toHaveProperty("status");
  });

  it.each(["/programs", `/programs/${PROGRAM_SLUG}`])("%s сохраняет заполненные поля базы", async (url) => {
    const fields = {
      description: "Опубликованное описание", cover: "11111111-1111-4111-8111-111111111111",
      tagline: "Опубликованный заголовок", source_url: "https://example.org/program", hse_id: "42",
      modules: [{ title: "Модуль из базы", hours: 16, points: ["Практика"] }],
      teachers: [{ name: "Преподаватель из базы", role: "Лектор", photo: null }],
      audience: ["Юристы"], results: ["Навыки из базы"], advantages: ["Практические занятия"],
    };
    resetDb({ programs: [program(fields)] });
    const response = await app.inject({ method: "GET", url });
    expect(response.statusCode).toBe(200);
    const row = url === "/programs" ? response.json()[0] : response.json();
    expect(row).toMatchObject({
      description: fields.description, cover: fields.cover, tagline: fields.tagline,
      source_url: fields.source_url, hse_id: fields.hse_id,
    });
    if (url !== "/programs") expect(row).toMatchObject(fields);
  });

  it.each([{ images: [], label: "[]" }, { images: null, label: "null" }])("товар сохраняет пустые images=$label известного slug", async ({ images }) => {
    resetDb({ products: [product({ images })] });
    const response = await app.inject({ method: "GET", url: "/products" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{
      id: "product-1", slug: PRODUCT_SLUG, title: "Товар из базы", category: "Одежда",
      price: 10_000, images, variants_json: [], stock: 0, description: "Описание из базы",
    }]);
  });

  it("товар сохраняет опубликованные изображения и варианты", async () => {
    const fields = {
      images: ["22222222-2222-4222-8222-222222222222"],
      variants_json: [{ sku: "actual-M", size: "M", stock: 3 }], stock: 3,
    };
    resetDb({ products: [product(fields)] });
    const response = await app.inject({ method: "GET", url: "/products" });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject(fields);
  });

  it("не публикует черновики и не создаёт отсутствующие позиции из сидов", async () => {
    resetDb({ programs: [program({ status: "draft" })], products: [product({ status: "draft" })] });
    const programs = await app.inject({ method: "GET", url: "/programs" });
    const products = await app.inject({ method: "GET", url: "/products" });
    const detail = await app.inject({ method: "GET", url: `/programs/${PROGRAM_SLUG}` });
    expect(programs.statusCode).toBe(200);
    expect(programs.json()).toEqual([]);
    expect(products.statusCode).toBe(200);
    expect(products.json()).toEqual([]);
    expect(detail.statusCode).toBe(404);
    expect(detail.json()).toEqual({ error: "Программа не найдена" });
  });
});
