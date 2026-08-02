import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);

const { db, resetDb } = await import("../test/fake-directus.js");
const { runDecay } = await import("./engine.js");

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
