import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../lib/data.js", async () => (await import("../test/fake-data.js")).dataModuleMock);

const { db, resetDb, dataModuleMock } = await import("../test/fake-data.js");
const { runDecay, addPoints, recompute } = await import("./engine.js");

const A = "al-1";
const daysAgo = (base: Date, n: number) => new Date(base.getTime() - n * 24 * 3600 * 1000).toISOString();
const NOW = new Date("2026-08-01T03:00:00.000Z");

beforeEach(() => {
  resetDb({
    // Неактивен (last_activity_at = null) → попадает в выборку decay.
    alumni: [{ id: A, points_cached: 500, level_cached: "expert", last_activity_at: null, verification_status: "verified" }],
    points_ledger: [{ id: "l1", alumni_id: A, delta: 500, reason: "program", created_at: "2026-01-01T00:00:00.000Z" }],
    achievements: [],
    alumni_achievements: [],
  });
});

function pauseFirstBalanceRead() {
  let resume!: () => void, reached!: () => void;
  const paused = new Promise<void>(resolve => { reached = resolve; });
  const released = new Promise<void>(resolve => { resume = resolve; });
  const original = dataModuleMock.data.request;
  let intercepted = false;
  const spy = vi.spyOn(dataModuleMock.data, "request").mockImplementation(async query => {
    const result = await original(query);
    if (!intercepted && query.kind === "readItems" && query.collection === "points_ledger" && query.query?.fields?.[0] === "delta") {
      intercepted = true;
      reached();
      await released;
    }
    return result;
  });
  return { paused, resume, restore: () => spy.mockRestore() };
}

describe("баллы одного участника при одновременных запросах", () => {
  it.each(["different-key", undefined])("кэш сохраняет оба начисления, второй ключ: %s", async secondKey => {
    const barrier = pauseFirstBalanceRead();
    const first = addPoints(A, { reason: "event", delta: 60, idempotencyKey: "first-key" });
    await barrier.paused;
    const second = addPoints(A, { reason: "manual", delta: 80, idempotencyKey: secondKey });
    try {
      // Все готовые микрозадачи второго запроса выполняются до возврата первого snapshot.
      // До исправления второй запрос писал 640, после чего первый затирал кэш числом 560.
      await new Promise<void>(resolve => setImmediate(resolve));
      barrier.resume();
      await Promise.all([first, second]);
      expect(db.points_ledger!.reduce((sum, row) => sum + row.delta, 0)).toBe(640);
      expect(db.alumni![0]!.points_cached).toBe(640);
    } finally { barrier.resume(); await Promise.allSettled([first, second]); barrier.restore(); }
  });

  it("отдельный пересчёт не затирает более новое начисление", async () => {
    const barrier = pauseFirstBalanceRead();
    const first = recompute(A);
    await barrier.paused;
    const second = addPoints(A, { reason: "event", delta: 60, idempotencyKey: "new-event" });
    try {
      await new Promise<void>(resolve => setImmediate(resolve));
      barrier.resume(); await Promise.all([first, second]);
      expect(db.alumni![0]!.points_cached).toBe(560);
    } finally { barrier.resume(); await Promise.allSettled([first, second]); barrier.restore(); }
  });

  it("медленный пересчёт одного участника не задерживает другого", async () => {
    db.alumni!.push({ id: "al-2", points_cached: 0, level_cached: "graduate" });
    const barrier = pauseFirstBalanceRead();
    const first = addPoints(A, { reason: "event", delta: 60 });
    await barrier.paused;
    try {
      const other = await addPoints("al-2", { reason: "manual", delta: 80 });
      expect(other.points).toBe(80);
      expect(db.alumni!.find(row => row.id === "al-2")!.points_cached).toBe(80);
    } finally { barrier.resume(); await first; barrier.restore(); }
  });
});

describe("runDecay", () => {
  it("списывает 15%, если давно не было decay", async () => {
    const res = await runDecay(NOW);
    expect(res.affected).toBe(1);
    const decays = db.points_ledger!.filter((r) => r.reason === "decay");
    expect(decays).toHaveLength(1);
    expect(decays[0]!.delta).toBe(-75); // 15% от 500
    expect(db.alumni![0]!.points_cached).toBe(425);
  });

  it("пропускает, если decay был < 27 дней назад (ручной /decay/run + cron на стыке месяцев)", async () => {
    db.points_ledger!.push({ id: "d0", alumni_id: A, delta: -75, reason: "decay", created_at: daysAgo(NOW, 10) });
    db.alumni![0]!.points_cached = 425;
    const res = await runDecay(NOW);
    expect(res.affected).toBe(0);
    expect(db.points_ledger!.filter((r) => r.reason === "decay")).toHaveLength(1); // второй не добавлен
    expect(db.alumni![0]!.points_cached).toBe(425); // без изменений
  });

  it("снова списывает, если прошлый decay был давно (> 27 дней)", async () => {
    db.points_ledger!.push({ id: "d0", alumni_id: A, delta: -88, reason: "decay", created_at: daysAgo(NOW, 40) });
    const res = await runDecay(NOW);
    expect(res.affected).toBe(1);
  });

  it("сумма списания считается из ledger, а не из рассинхронизированного points_cached", async () => {
    db.alumni![0]!.points_cached = 9999; // кэш врёт, ledger суммирует в 500
    await runDecay(NOW);
    const decay = db.points_ledger!.find((r) => r.reason === "decay");
    expect(decay!.delta).toBe(-75); // 15% от 500, а не от 9999
    expect(db.alumni![0]!.points_cached).toBe(425); // кэш заодно исправлен
  });
});
