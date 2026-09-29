import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import sharp from "sharp";
import { MediaStore, mediaStore } from "../lib/media-store.js";


vi.mock("../lib/data.js", async () => ({ data: (await import("../test/fake-data.js")).dataModuleMock.data }));

const { db } = await import("../test/fake-data.js");
const { resetAuthDb: resetDb } = await import("../test/fake-native-auth-store.js");
const { avatarsRoutes } = await import("./avatars.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");

const ME = "alumni-1";
const token = (id = ME) => jwt.sign({ alumni_id: id, sub: `u-${id}`, ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

// Настоящие небольшие изображения проходят и проверку сигнатуры, и декодирование.
const source = { create: { width: 32, height: 48, channels: 3 as const, background: "#247b9c" } };
const JPEG = await sharp(source).jpeg().toBuffer();
const PNG = await sharp(source).png().toBuffer();
const WEBP = await sharp(source).webp().toBuffer();
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

let directory:string;
let deleted:string[];
afterEach(async () => { await rm(directory,{recursive:true,force:true}); });
beforeEach(async () => {
  vi.restoreAllMocks();
  resetDb({
    alumni: [{ id: ME, fio: "Иван", verification_status: "verified", token_version: 0, avatar: null }],
  });
  directory=await mkdtemp(join(tmpdir(),"club-avatar-test-"));
  deleted=[];
  const stored=new Map<string,Record<string,unknown>>();
  const query=vi.fn(async (sql:string,args:unknown[] = []) => {
    if(sql.startsWith("INSERT INTO directus_files")) {
      const file={id:args[0],storage:"local",filename_disk:args[1],filename_download:args[2],type:args[3],filesize:args[5],metadata:JSON.parse(args[6] as string)};
      stored.set(file.id as string,file);return {rows:[file]};
    }
    if(sql.startsWith("SELECT * FROM directus_files"))return {rows:stored.has(args[0] as string)?[stored.get(args[0] as string)]:[]};
    if(sql.startsWith("DELETE FROM directus_files")){deleted.push(args[0] as string);stored.delete(args[0] as string);}
    return {rows:[]};
  });
  const native=new MediaStore({directory:() => directory,pool:() => ({query,connect:async () => ({query,release:vi.fn()})}) as unknown as Pool});
  vi.spyOn(mediaStore,"save").mockImplementation(native.save.bind(native));
  vi.spyOn(mediaStore,"delete").mockImplementation(native.delete.bind(native));

});

describe("POST /me/avatar – тип определяется по содержимому", () => {
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
    expect(db.alumni![0]!.avatar).toMatch(/^[\da-f-]{36}$/);
  });

  it("настоящий PNG принимается", async () => {
    const app = await build();
    expect((await upload(app, PNG, "image/png")).statusCode).toBe(200);
  });

  it("настоящий WebP принимается", async () => {
    const app = await build();
    expect((await upload(app, WEBP, "image/webp", "a.webp")).statusCode).toBe(200);
  });

  it("картинка с чужим заявленным типом всё равно принимается – верим содержимому", async () => {
    const app = await build();
    // Клиент соврал в Content-Type, но байты – настоящий PNG.
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

describe("POST /me/avatar – доступ", () => {
  it("без токена – 401", async () => {
    const app = await build();
    const m = multipart(PNG, "a.png", "image/png");
    const r = await app.inject({ method: "POST", url: "/me/avatar", headers: m.headers, payload: m.payload });
    expect(r.statusCode).toBe(401);
  });

  it("pending – можно загрузить фото", async () => {
    const app = await build();
    db.alumni![0]!.verification_status = "pending";
    const r = await upload(app, PNG, "image/png");
    expect(r.statusCode).toBe(200);
    expect(r.json().avatar).toBeTruthy();
  });

  it("rejected – 403", async () => {
    const app = await build();
    db.alumni![0]!.verification_status = "rejected";
    const r = await upload(app, PNG, "image/png");
    expect(r.statusCode).toBe(403);
  });
});

it("ошибка сохранения профиля не удаляет прежнее фото", async () => {
  const { dataModuleMock } = await import("../test/fake-data.js");
  const original = dataModuleMock.data.request;
  db.alumni![0]!.avatar = "old-file";
  vi.spyOn(dataModuleMock.data, "request").mockImplementation(async (op: any) => {
    if (op.kind === "updateItem" && op.collection === "alumni") throw new Error("storage unavailable");
    return original(op);
  });
  const app = await build();
  expect((await upload(app, PNG, "image/png")).statusCode).toBe(500);
  expect(db.alumni![0]!.avatar).toBe("old-file");
  expect(deleted).toHaveLength(1);
  expect(deleted).not.toContain("old-file");
});
