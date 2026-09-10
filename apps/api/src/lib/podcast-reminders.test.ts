import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@directus/sdk", async () => await import("../test/fake-sdk.js"));
vi.mock("../lib/directus.js", async () => (await import("../test/fake-directus.js")).directusModuleMock);
vi.mock("./push.js", () => ({ pushToAlumniMany: vi.fn(async () => 0) }));
vi.mock("./notify.js", () => ({
  sendEmail: vi.fn(async () => true),
  mailEnabled: vi.fn(() => true),
  notifyOffice: vi.fn(),
  notifyOfficeText: vi.fn(),
}));

const { db, resetDb } = await import("../test/fake-directus.js");
const { runPodcastSubReminders, REMIND_DAYS_BEFORE } = await import("./podcast-reminders.js");
const push = await import("./push.js");
const notify = await import("./notify.js");

const days = (n: number) => new Date(Date.now() + n * 86400000).toISOString();

const alum = (over: Record<string, unknown> = {}) => ({
  id: "a1", fio: "Кондратьев Сергей", podcast_sub_until: days(5),
  podcast_reminder_sent: false, contacts_json: { email: "k@example.com" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(notify.mailEnabled).mockReturnValue(true);
  resetDb({ alumni: [] });
});

describe("Напоминание об окончании подписки на подкасты", () => {
  it(`уходит, когда осталось меньше ${REMIND_DAYS_BEFORE} дней`, async () => {
    db.alumni = [alum({ podcast_sub_until: days(5) })];
    const r = await runPodcastSubReminders();

    expect(r.due).toBe(1);
    expect(push.pushToAlumniMany).toHaveBeenCalledTimes(1);
    expect(notify.sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notify.sendEmail).mock.calls[0]![0]).toBe("k@example.com");
  });

  it("не уходит, если до конца ещё далеко", async () => {
    db.alumni = [alum({ podcast_sub_until: days(40) })];
    const r = await runPodcastSubReminders();

    expect(r.due).toBe(0);
    expect(push.pushToAlumniMany).not.toHaveBeenCalled();
    expect(notify.sendEmail).not.toHaveBeenCalled();
  });

  /**
   * Cron ходит каждый день. Без флага выпускник получал бы одно и то же
   * письмо десять дней подряд.
   */
  it("повторный прогон в тот же период ничего не шлёт", async () => {
    db.alumni = [alum({ podcast_sub_until: days(5) })];
    await runPodcastSubReminders();
    vi.clearAllMocks();

    const second = await runPodcastSubReminders();
    expect(second.due).toBe(0);
    expect(notify.sendEmail).not.toHaveBeenCalled();
    expect(db.alumni![0]!.podcast_reminder_sent).toBe(true);
  });

  it("уже истёкшую подписку не трогаем – напоминать задним числом бессмысленно", async () => {
    db.alumni = [alum({ podcast_sub_until: days(-3) })];
    const r = await runPodcastSubReminders();
    expect(r.due).toBe(0);
  });

  it("выпускник без подписки в выборку не попадает", async () => {
    db.alumni = [alum({ podcast_sub_until: null })];
    const r = await runPodcastSubReminders();
    expect(r.due).toBe(0);
  });

  /**
   * Флаг ставится независимо от того, ушло ли письмо: иначе при выключенном
   * SMTP выборка оставалась бы «горячей» и cron дёргал бы её каждый день.
   */
  it("без почты и SMTP флаг всё равно ставится", async () => {
    vi.mocked(notify.mailEnabled).mockReturnValue(false);
    db.alumni = [alum({ contacts_json: null })];
    const r = await runPodcastSubReminders();

    expect(r.due).toBe(1);
    expect(r.emails).toBe(0);
    expect(notify.sendEmail).not.toHaveBeenCalled();
    expect(db.alumni![0]!.podcast_reminder_sent).toBe(true);
  });

  it("пуш уходит одним запросом на всех, а не по одному на каждого", async () => {
    db.alumni = [
      alum({ id: "a1", podcast_sub_until: days(3) }),
      alum({ id: "a2", podcast_sub_until: days(7) }),
      alum({ id: "a3", podcast_sub_until: days(9) }),
    ];
    const r = await runPodcastSubReminders();

    expect(r.due).toBe(3);
    expect(push.pushToAlumniMany).toHaveBeenCalledTimes(1);
    expect(vi.mocked(push.pushToAlumniMany).mock.calls[0]![0]).toEqual(["a1", "a2", "a3"]);
  });
});
