import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { avatarsRoutes } = await import("./avatars.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const ME = "alumni-1";
const token = (id = ME) => jwt.sign({ alumni_id: id, sub: `u-${id}`, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

// Минимальные валидные заголовки форматов — проверяется именно сигнатура.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4, 0), Buffer.from("WEBP"), Buffer.alloc(32, 1)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');
const PDF = Buffer.concat([Buffer.from("%PDF-1.7"), Buffer.alloc(32, 1)]);

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(avatarsRoutes);
  return app;
}

/** multipart-тело с одним файлом и заявленным клиентом типом. */
function multipart(body: Buffer, filename: string, declaredType: string) {
  const b = "----vitestboundary";
  const head = Buffer.from(
    `--${b}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: ${declaredType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${b}--\r\n`);
  return { payload: Buffer.concat([head, body, tail]), headers: { "content-type": `multipart/form-data; boundary=${b}` } };
}

const upload = (app: FastifyInstance, body: Buffer, declaredType: string, filename = "avatar.png") => {
  const m = multipart(body, filename, declaredType);
  return app.inject({ method: "POST", url: "/me/avatar", headers: { ...m.headers, authorization: `Bearer ${token()}` }, payload: m.payload });
};

beforeEach(() => {
  vi.restoreAllMocks();
  resetDb({
    alumni: [{ id: ME, fio: "Иван", verification_status: "verified", token_version: 0, avatar: null }],
  });
  // Загрузку в Directus Files подменяем: проверяем гард, а не сеть.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { id: "file-1" } }), { status: 200, headers: { "content-type": "application/json" } })));
});

describe("POST /me/avatar — тип определяется по содержимому", () => {
  it("HTML под видом image/png отклоняется", async () => {
    const app = await build();
    const r = await upload(app, HTML, "image/png");
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/не изображение/i);
    expect(db.alumni![0]!.avatar).toBeNull();
  });

  it("PDF под видом image/jpeg отклоняется", async () => {
    const app = await build();
    const r = await upload(app, PDF, "image/jpeg");
    expect(r.statusCode).toBe(400);
    expect(db.alumni![0]!.avatar).toBeNull();
  });

  it("отклонённая загрузка попадает в аудит с заявленным типом", async () => {
    const app = await build();
    await upload(app, HTML, "image/png");
    const rec = (db.audit_log ?? []).find((e) => e.event === "avatar.reject");
    expect(rec).toBeTruthy();
    expect(rec!.detail?.declared).toBe("image/png");
  });

  it("настоящий JPEG принимается", async () => {
    const app = await build();
    const r = await upload(app, JPEG, "image/jpeg", "a.jpg");
    expect(r.statusCode).toBe(200);
    expect(db.alumni![0]!.avatar).toBe("file-1");
  });

  it("настоящий PNG принимается", async () => {
    const app = await build();
    expect((await upload(app, PNG, "image/png")).statusCode).toBe(200);
  });

  it("настоящий WebP принимается", async () => {
    const app = await build();
    expect((await upload(app, WEBP, "image/webp", "a.webp")).statusCode).toBe(200);
  });

  it("картинка с чужим заявленным типом всё равно принимается — верим содержимому", async () => {
    const app = await build();
    // Клиент соврал в Content-Type, но байты — настоящий PNG.
    const r = await upload(app, PNG, "image/jpeg");
    expect(r.statusCode).toBe(200);
  });

  it("неподдерживаемый заявленный тип отсекается до чтения байт", async () => {
    const app = await build();
    const r = await upload(app, PNG, "application/pdf");
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toMatch(/JPEG, PNG или WebP/i);
  });
});

describe("POST /me/avatar — доступ", () => {
  it("без токена — 401", async () => {
    const app = await build();
    const m = multipart(PNG, "a.png", "image/png");
    const r = await app.inject({ method: "POST", url: "/me/avatar", headers: m.headers, payload: m.payload });
    expect(r.statusCode).toBe(401);
  });

  it("неверифицированному — 403", async () => {
    const app = await build();
    db.alumni![0]!.verification_status = "pending";
    const r = await upload(app, PNG, "image/png");
    expect(r.statusCode).toBe(403);
  });
});
