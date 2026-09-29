import { afterEach, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  schedule: vi.fn(() => ({ destroy: vi.fn(async () => {}) })),
  purge: vi.fn(async () => {}),
  polling: vi.fn(() => async () => {}),
  commands: vi.fn(async () => {}),
}));
vi.mock("node-cron", () => ({ default: { schedule: mocked.schedule } }));
vi.mock("../routes/support.js", () => ({ purgeSupport: mocked.purge }));
vi.mock("./telegram-polling.js", () => ({ startTelegramPolling: mocked.polling }));
vi.mock("./telegram-bot.js", () => ({ registerBotCommands: mocked.commands }));

const { createJobRunner, scheduledJobs, startBackgroundJobs, JOB_TIMEZONE } = await import("./jobs.js");
const { env } = await import("../env.js");
const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const original = { jobs: env.JOBS_ENABLED, dpo: env.DPO_SYNC_ENABLED, news: env.NEWS_SYNC_ENABLED };
afterEach(() => {
  env.JOBS_ENABLED = original.jobs; env.DPO_SYNC_ENABLED = original.dpo; env.NEWS_SYNC_ENABLED = original.news;
  vi.clearAllMocks(); vi.useRealTimers();
});

it("JOBS_ENABLED=false не планирует cron и не запускает стартовые операции", async () => {
  env.JOBS_ENABLED = "false";
  const jobs = await startBackgroundJobs(logger());
  expect(mocked.schedule).not.toHaveBeenCalled();
  expect(mocked.purge).not.toHaveBeenCalled();
  expect(mocked.polling).not.toHaveBeenCalled();
  expect(mocked.commands).not.toHaveBeenCalled();
  expect(await jobs.stop()).toBe(true);
});

it("DPO и новости отключаются отдельно, остальные расписания сохранены", async () => {
  env.JOBS_ENABLED = "true"; env.DPO_SYNC_ENABLED = "false"; env.NEWS_SYNC_ENABLED = "false";
  expect(scheduledJobs().find(job => job.id === "dpo-sync")?.enabled).toBe(false);
  const jobs = await startBackgroundJobs(logger());
  expect(mocked.schedule).toHaveBeenCalledTimes(6);
  for (const args of mocked.schedule.mock.calls as unknown[][]) expect(args[2]).toEqual({ timezone: JOB_TIMEZONE });
  await jobs.stop();
  for (const task of mocked.schedule.mock.results) expect(task.value.destroy).toHaveBeenCalledOnce();
});

it("одна задача не перекрывает себя, остановка ждёт её завершения", async () => {
  const log = logger(), runner = createJobRunner(log);
  let finish!: () => void;
  const task = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  const first = runner.run("job", task);
  await Promise.resolve();
  await runner.run("job", task);
  expect(task).toHaveBeenCalledTimes(1);
  expect(log.warn).toHaveBeenCalledWith({ job: "job", status: "overlap_skipped" }, "background job");
  const stopping = runner.stop();
  finish(); await first;
  expect(await stopping).toBe(true);
  await runner.run("job", task);
  expect(task).toHaveBeenCalledTimes(1);
});

it("ошибка записывается без текста с ПДн и освобождает запуск", async () => {
  const log = logger(), runner = createJobRunner(log);
  await runner.run("job", async () => { throw new Error("private@example.test secret-token"); });
  expect(JSON.stringify(log.error.mock.calls)).not.toMatch(/private|secret-token/);
  expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ job: "job", status: "failed" }), "background job");
  const retry = vi.fn(async () => {}); await runner.run("job", retry);
  expect(retry).toHaveBeenCalledOnce();
  await runner.stop();
});

it("незавершённая задача отмечается по истечении срока остановки", async () => {
  vi.useFakeTimers();
  const log = logger(), runner = createJobRunner(log);
  void runner.run("slow", () => new Promise(() => {}));
  const stopping = runner.stop(100);
  await vi.advanceTimersByTimeAsync(100);
  expect(await stopping).toBe(false);
  expect(log.warn).toHaveBeenCalledWith({ jobs: ["slow"], status: "shutdown_timeout" }, "background jobs");
});
