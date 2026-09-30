import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Pool } from "pg";
import { MediaStore, mediaStore } from "../../../../src/modules/media/media-store.js";

vi.mock("../../../../src/db/checkout-store.js", async () => await import("../../../helpers/fake-checkout.js"));

vi.mock("../../../../src/db/data.js", async () => ({ data:(await import("../../../helpers/fake-data.js")).dataModuleMock.data }));
vi.mock("../../../../src/modules/notifications/notify.js", () => ({
  notifyOffice: vi.fn(async () => ({ channel: "test", ok: true })),
  notifyOfficeText: vi.fn(async () => undefined),
  sendEmail: vi.fn(async () => true),
  mailEnabled: () => false,
}));
vi.mock("../../../../src/modules/checkout/yookassa.js", () => ({
  paymentsEnabled: () => false,
  createPayment: vi.fn(),
  fetchPayment: vi.fn(),
}));

const { db } = await import("../../../helpers/fake-data.js");
const { resetAuthDb: resetDb } = await import("../../../helpers/fake-native-auth-store.js");
const { podcastsRoutes } = await import("../../../../src/modules/podcasts/routes.js");
const { registerErrorHandler } = await import("../../../../src/common/errors.js");
const { env } = await import("../../../../src/config/env.js");
const notify = await import("../../../../src/modules/notifications/notify.js");
const { data } = await import("../../../../src/db/data.js");
const { request: fakeRequest } = await import("../../../helpers/fake-data.js");
import type { DataCommand } from "../../../../src/db/data-commands.js";

let mediaDirectory:string;
const MEDIA_FILE="13a8c2fc-f5ba-4f04-95fc-10e23c37cab6";
const MEDIA_AUDIO=Buffer.concat([Buffer.from("ID3"),Buffer.alloc(90,7)]);
afterEach(async () => {vi.restoreAllMocks();await rm(mediaDirectory,{recursive:true,force:true});});

const ALUMNI = "alumni-1";
const token = () => jwt.sign({ alumni_id: ALUMNI, sub: "user-1", ver: 0 }, env.AUTH_SECRET, { expiresIn: "7d" });

async function build(): Promise<FastifyInstance> {
  const app = Fastify();
  registerErrorHandler(app);
  await app.register(podcastsRoutes);
  return app;
}

const subscribe = (app: FastifyInstance) =>
  app.inject({ method: "POST", url: "/podcasts/subscribe", headers: { authorization: `Bearer ${token()}` }, payload: {} });

beforeEach(async () => {
  vi.clearAllMocks();
  mediaDirectory=await mkdtemp(join(tmpdir(),"club-podcast-"));
  await writeFile(join(mediaDirectory,"legacy.mp3"),MEDIA_AUDIO);
  const native=new MediaStore({directory:() => mediaDirectory,pool:() => ({query:async (_sql:string,args:string[]) => ({rows:args[0]===MEDIA_FILE ? [{id:MEDIA_FILE,storage:"local",filename_disk:"legacy.mp3",type:"audio/mpeg"}] : []})}) as unknown as Pool});
  vi.spyOn(mediaStore,"isAvatar").mockImplementation(async id => (db.alumni ?? []).some(a => a.avatar===id));
  vi.spyOn(mediaStore,"stream").mockImplementation(native.stream.bind(native));
  resetDb({
    alumni: [{ id: ALUMNI, user_id: "user-1", fio: "Иван", verification_status: "verified", token_version: 0, podcast_sub_until: null, contacts_json: { email: "ivan@example.com" } }],
    orders: [],
    podcasts: [],
  });
});

describe("POST /podcasts/subscribe – заявка не задваивается", () => {
  it("потеря ответа после записи не создаёт второй заказ", async () => {
    let writes = 0;
    vi.spyOn(data, "request").mockImplementation(async (command: any) => {
      const desc = command as DataCommand;
      const result = await fakeRequest(desc);
      if (desc.kind === "createItem" && desc.collection === "orders") {
        writes++;
        throw new Error("connection reset after commit");
      }
      return result;
    });
    const app = await build();
    const result = await subscribe(app);
    expect(result.statusCode).toBe(500);
    expect(writes).toBe(1);
    expect(db.orders).toHaveLength(1);
    expect(notify.notifyOffice).not.toHaveBeenCalled();
    const retry = await subscribe(app);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().already).toBe(true);
    expect(db.orders).toHaveLength(1);
    await app.close();
  });

  it("коллизия номера повторяет запись со следующим номером", async () => {
    const numbers: string[] = [];
    vi.spyOn(data, "request").mockImplementation(async (command: any) => {
      const desc = command as DataCommand;
      if (desc.kind === "createItem" && desc.collection === "orders") {
        numbers.push((desc.data as { number: string }).number);
        if (numbers.length === 1) throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
      }
      return fakeRequest(desc);
    });
    const app = await build();
    expect((await subscribe(app)).statusCode).toBe(200);
    expect(numbers).toHaveLength(2);
    expect(numbers[0]).not.toBe(numbers[1]);
    expect(db.orders).toHaveLength(1);
    expect(notify.notifyOffice).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("первый вызов создаёт заявку и зовёт офис", async () => {
    const app = await build();
    const r = await subscribe(app);
    expect(r.statusCode).toBe(200);
    expect(db.orders).toHaveLength(1);
    expect(db.orders![0]!.type).toBe("podcast");
    expect(notify.notifyOffice).toHaveBeenCalledTimes(1);
  });

  it("повторные вызовы возвращают ту же заявку и офис больше не дёргают", async () => {
    const app = await build();
    const first = await subscribe(app);
    const second = await subscribe(app);
    const third = await subscribe(app);

    expect(db.orders).toHaveLength(1);
    expect(second.json().number).toBe(first.json().number);
    expect(third.json().number).toBe(first.json().number);
    expect(second.json().already).toBe(true);
    expect(notify.notifyOffice).toHaveBeenCalledTimes(1);
  });

  it("после оплаты прежней заявки новая создаётся", async () => {
    const app = await build();
    await subscribe(app);
    db.orders![0]!.payment_status = "succeeded";
    db.orders![0]!.status = "confirmed";
    const r = await subscribe(app);
    expect(r.statusCode).toBe(200);
    expect(db.orders).toHaveLength(2);
  });

  it("отменённая заявка не блокирует новую", async () => {
    const app = await build();
    await subscribe(app);
    db.orders![0]!.payment_status = "canceled";
    db.orders![0]!.status = "canceled";
    const r = await subscribe(app);
    expect(db.orders).toHaveLength(2);
    expect(r.json().already).toBeUndefined();
  });

  it("активная подписка – 400, заявка не создаётся", async () => {
    const app = await build();
    db.alumni![0]!.podcast_sub_until = new Date(Date.now() + 86400000).toISOString();
    const r = await subscribe(app);
    expect(r.statusCode).toBe(400);
    expect(db.orders).toHaveLength(0);
  });

  it("без токена – 401", async () => {
    const app = await build();
    const r = await app.inject({ method: "POST", url: "/podcasts/subscribe", payload: {} });
    expect(r.statusCode).toBe(401);
    expect(db.orders).toHaveLength(0);
  });

  it("неверифицированному – 403", async () => {
    const app = await build();
    db.alumni![0]!.verification_status = "pending";
    const r = await subscribe(app);
    expect(r.statusCode).toBe(403);
    expect(db.orders).toHaveLength(0);
  });
});

describe("GET /podcasts/:id/audio – локальное хранилище и доступ", () => {
  const PID="11111111-1111-4111-8111-111111111111";
  const FILE=MEDIA_FILE;
  async function signed(app:FastifyInstance,headers?:Record<string,string>) {
    const list=await app.inject("/podcasts");
    return app.inject({url:list.json().items[0].audio_url.replace(/^\/api/,""),headers});
  }
  const episode=(audio_url=FILE) => {db.podcasts=[{id:PID,title:"Выпуск",status:"published",is_free:true,audio_url,sort:0}];};

  it("внешний URL по-прежнему отдаётся редиректом",async () => {
    const app=await build();episode("https://example.org/a.mp3");
    const result=await signed(app);expect(result.statusCode).toBe(302);expect(result.headers.location).toBe("https://example.org/a.mp3");
  });
  it("legacy UUID отдаёт реальные локальные байты",async () => {
    const app=await build();episode();const result=await signed(app);
    expect(result.statusCode).toBe(200);expect(result.rawPayload).toEqual(MEDIA_AUDIO);
    expect(result.headers["content-type"]).toBe("audio/mpeg");expect(result.headers["accept-ranges"]).toBe("bytes");
    expect(result.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("старый абсолютный CMS assets URL читается локально",async () => {
    const app=await build();episode(`https://old-cms.example/assets/${FILE}`);
    const result=await signed(app);expect(result.statusCode).toBe(200);expect(result.rawPayload).toEqual(MEDIA_AUDIO);
  });
  it("UUID аватара не выдаётся под видом аудио",async () => {
    const app=await build();episode();db.alumni![0]!.avatar=FILE;
    expect((await signed(app)).statusCode).toBe(404);expect(mediaStore.stream).not.toHaveBeenCalled();
  });
  it("не-audio файл не маскируется под audio/mpeg",async () => {
    const app=await build();episode();
    await writeFile(join(mediaDirectory,"legacy.mp3"),Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(40)]));
    expect((await signed(app)).statusCode).toBe(404);
  });
  it("Range возвращает нужный фрагмент локального файла",async () => {
    const app=await build();episode();const bytes=Buffer.concat([Buffer.from("ID3"),Buffer.alloc(996,9)]);
    await writeFile(join(mediaDirectory,"legacy.mp3"),bytes);
    const result=await signed(app,{range:"bytes=10-10"});
    expect(result.statusCode).toBe(206);expect(result.headers["content-range"]).toBe("bytes 10-10/999");expect(result.rawPayload).toEqual(Buffer.from([9]));
  });
  it("истёкшая подписка закрывает аудио при действующей подписи",async () => {
    const app=await build();episode();db.podcasts![0]!.is_free=false;
    db.alumni![0]!.podcast_sub_until=new Date(Date.now()+864e5).toISOString();
    const list=await app.inject({url:"/podcasts",headers:{authorization:`Bearer ${token()}`}});
    const url=list.json().items[0].audio_url as string;expect(url).toBeTruthy();
    db.alumni![0]!.podcast_sub_until=new Date(Date.now()-864e5).toISOString();
    expect((await app.inject(url.replace(/^\/api/,""))).statusCode).toBe(403);
    expect(mediaStore.stream).not.toHaveBeenCalled();
  });
});

describe("Учёт прослушиваний", () => {
  const PID = "22222222-2222-4222-8222-222222222222";
  const FILE = "13a8c2fc-f5ba-4f04-95fc-10e23c37cab6";

  const play = async (app: FastifyInstance, headers?: Record<string, string>) => {
    const list = await app.inject({ method: "GET", url: "/podcasts" });
    const url = list.json().items[0].audio_url as string;
    return app.inject({ method: "GET", url: url.replace(/^\/api/, ""), headers });
  };

  beforeEach(() => {
    db.podcasts = [{ id: PID, title: "Пробный", status: "published", is_free: true, audio_url: FILE, sort: 0 }];
    db.podcast_plays = [];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), {
      status: 200, headers: { "content-type": "audio/mpeg" },
    })));
  });

  it("первое прослушивание записывается", async () => {
    const app = await build();
    await play(app);
    expect(db.podcast_plays).toHaveLength(1);
    expect(db.podcast_plays![0]!.podcast_id).toBe(PID);
    vi.unstubAllGlobals();
  });

  it("повторное обращение в том же окне не задваивает счётчик", async () => {
    const app = await build();
    await play(app);
    await play(app);
    await play(app);
    expect(db.podcast_plays).toHaveLength(1);
    vi.unstubAllGlobals();
  });

  it("перемотка не считается прослушиванием", async () => {
    const app = await build();
    await play(app, { range: "bytes=32-63" });
    expect(db.podcast_plays).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("у бесплатного выпуска слушатель не записывается – его личность неизвестна", async () => {
    const app = await build();
    await play(app);
    expect(db.podcast_plays![0]!.alumni_id).toBeNull();
    vi.unstubAllGlobals();
  });

  it("сбой учёта не ломает выдачу аудио", async () => {
    const app = await build();
    // Коллекция недоступна – слушатель всё равно должен получить файл
    const orig = db.podcast_plays;
    Object.defineProperty(db, "podcast_plays", { get() { throw new Error("нет прав"); }, configurable: true });
    const r = await play(app);
    expect(r.statusCode).toBe(200);
    Object.defineProperty(db, "podcast_plays", { value: orig, writable: true, configurable: true });
    vi.unstubAllGlobals();
  });
});
