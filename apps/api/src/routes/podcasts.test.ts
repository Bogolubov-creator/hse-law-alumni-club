import { describe, it, expect, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import jwt from "jsonwebtoken";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("../lib/notify.js", () => ({
  notifyOffice: vi.fn(async () => ({ channel: "test", ok: true })),
  notifyOfficeText: vi.fn(async () => undefined),
  sendEmail: vi.fn(async () => true),
  mailEnabled: () => false,
}));
vi.mock("../lib/yookassa.js", () => ({
  paymentsEnabled: () => false,
  createPayment: vi.fn(),
  fetchPayment: vi.fn(),
}));

const { db, resetDb } = await import("../test/fake-directus.js");
const { podcastsRoutes } = await import("./podcasts.js");
const { registerErrorHandler } = await import("../lib/errors.js");
const { env } = await import("../env.js");
const notify = await import("../lib/notify.js");

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

beforeEach(() => {
  vi.clearAllMocks();
  resetDb({
    alumni: [{ id: ALUMNI, fio: "Иван", verification_status: "verified", token_version: 0, podcast_sub_until: null, contacts_json: { email: "ivan@example.com" } }],
    orders: [],
    podcasts: [],
  });
});

describe("POST /podcasts/subscribe – заявка не задваивается", () => {
  it("первый вызов создаёт заявку и зовёт офис", async () => {
    const app = await build();
    const r = await subscribe(app);
    expect(r.statusCode).toBe(200);
    expect(db.orders).toHaveLength(1);
    expect(db.orders![0]!.type).toBe("podcast");
    expect(notify.notifyOffice).toHaveBeenCalledTimes(1);
  });

  /**
   * Раньше каждый повторный клик создавал новую заявку и дёргал офис ещё раз.
   * Теперь возвращается уже существующая незакрытая заявка.
   */
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

/**
 * Отдача аудио. Ручка умеет два источника, и обе ветки должны работать:
 * сторонний хостинг (редирект, как было) и файл в Directus (наш прокси).
 *
 * Прокси появился потому, что хранилище Directus закрыто от публики – и
 * открывать его нельзя, там же лежат аватары выпускников.
 */
describe("GET /podcasts/:id/audio – источники аудио", () => {
  const PID = "11111111-1111-4111-8111-111111111111";
  const FILE = "13a8c2fc-f5ba-4f04-95fc-10e23c37cab6";

  /** Подписанная ссылка строится ровно так же, как её выдаёт список. */
  const signed = async (app: FastifyInstance, headers?: Record<string, string>) => {
    const list = await app.inject({ method: "GET", url: "/podcasts" });
    const url = list.json().items[0].audio_url as string;
    return app.inject({ method: "GET", url: url.replace(/^\/api/, ""), headers });
  };

  it("внешний URL по-прежнему отдаётся редиректом", async () => {
    const app = await build();
    db.podcasts = [{ id: PID, title: "Внешний", status: "published", is_free: true, audio_url: "https://example.org/a.mp3", sort: 0 }];
    const r = await signed(app);
    expect(r.statusCode).toBe(302);
    expect(r.headers.location).toBe("https://example.org/a.mp3");
  });

  it("файл из Directus отдаётся нашим прокси, а не редиректом на закрытое хранилище", async () => {
    const app = await build();
    db.podcasts = [{ id: PID, title: "Свой файл", status: "published", is_free: true, audio_url: FILE, sort: 0 }];
    const calls: { url: string; range?: string }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: any) => {
      calls.push({ url: String(url), range: init?.headers?.range });
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/mpeg", "content-length": "3" },
      });
    }));

    const r = await signed(app);
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toBe("audio/mpeg");
    // Без Accept-Ranges плеер не умеет перематывать и тянет выпуск целиком
    expect(r.headers["accept-ranges"]).toBe("bytes");
    expect(r.headers["x-content-type-options"]).toBe("nosniff");
    // Наружу не должен утечь сервисный токен: файл тянет сервер, а не браузер
    expect(calls[0]!.url).toContain(`/assets/${FILE}`);
    vi.unstubAllGlobals();
  });

  it("перемотка пробрасывается в хранилище и возвращает 206", async () => {
    const app = await build();
    db.podcasts = [{ id: PID, title: "Свой файл", status: "published", is_free: true, audio_url: FILE, sort: 0 }];
    let seenRange: string | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      seenRange = init?.headers?.range;
      return new Response(new Uint8Array([9]), {
        status: 206,
        headers: { "content-type": "audio/mpeg", "content-range": "bytes 10-10/999", "content-length": "1" },
      });
    }));

    const r = await signed(app, { range: "bytes=10-10" });
    expect(seenRange).toBe("bytes=10-10");
    expect(r.statusCode).toBe(206);
    expect(r.headers["content-range"]).toBe("bytes 10-10/999");
    vi.unstubAllGlobals();
  });

  /**
   * Ссылка живёт 2 часа, а подписка может кончиться раньше. Держатель уже
   * выданной подписи не должен получить аудио после окончания подписки –
   * иначе годовой доступ продлевался бы сохранённой ссылкой.
   */
  it("истёкшая подписка закрывает аудио, даже если подпись ещё верна", async () => {
    const app = await build();
    db.podcasts = [{ id: PID, title: "Платный", status: "published", is_free: false, audio_url: FILE, sort: 0 }];

    // Пока подписка активна – список выдаёт подписанную ссылку
    db.alumni![0]!.podcast_sub_until = new Date(Date.now() + 864e5).toISOString();
    const list = await app.inject({ method: "GET", url: "/podcasts", headers: { authorization: `Bearer ${token()}` } });
    const url = list.json().items[0].audio_url as string;
    expect(url).toBeTruthy();

    // Подписка кончилась – та же ссылка больше не работает
    db.alumni![0]!.podcast_sub_until = new Date(Date.now() - 864e5).toISOString();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const r = await app.inject({ method: "GET", url: url.replace(/^\/api/, "") });
    expect(r.statusCode).toBe(403);
    // До хранилища дело дойти не должно вообще
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

/**
 * Учёт прослушиваний. Считает сервер при выдаче аудио: счётчик, который шлёт
 * браузер, накручивается одной строкой в консоли.
 */
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

  /**
   * При перемотке плеер шлёт десятки Range-запросов. Если считать каждый,
   * статистика покажет не слушателей, а сетевую активность.
   */
  it("перемотка не считается прослушиванием", async () => {
    const app = await build();
    await play(app, { range: "bytes=5000000-5001000" });
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
