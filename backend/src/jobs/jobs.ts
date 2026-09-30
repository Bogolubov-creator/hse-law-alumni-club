import cron from "node-cron";
import { env } from "../config/env.js";
import { runDecay } from "../modules/gamification/engine.js";
import { syncDpoCatalog } from "../modules/catalog/hse-sync.js";
import { runEventReminders } from "../modules/events/event-reminders.js";
import { runPodcastSubReminders } from "../modules/podcasts/podcast-reminders.js";
import { runRetention } from "./retention.js";
import { expireStaleReservations } from "../db/checkout-store.js";
import { drainMailOutbox } from "../modules/notifications/notify.js";
import { refreshNewsSource } from "../modules/news/news-sources.js";
import { purgeSupport } from "../modules/support/routes.js";
import { registerBotCommands } from "../modules/telegram/telegram-bot.js";
import { startTelegramPolling } from "../modules/telegram/telegram-polling.js";

export const JOB_TIMEZONE = "Europe/Moscow";
const SHUTDOWN_TIMEOUT_MS = 20_000;
type JobLogger = Pick<Console, "info" | "warn" | "error">;
export type Job = { id: string; schedule: string; enabled?: boolean; run: () => Promise<unknown> };

/** Один процесс API: повторный тик пропускается, пока предыдущий запуск не завершён. */
export function createJobRunner(logger: JobLogger) {
  const running = new Map<string, Promise<void>>();
  let stopped = false;
  function run(id: string, task: () => Promise<unknown>): Promise<void> {
    if (stopped) return Promise.resolve();
    if (running.has(id)) {
      logger.warn({ job: id, status: "overlap_skipped" }, "background job");
      return Promise.resolve();
    }
    const started = Date.now();
    const promise = Promise.resolve().then(task).then(
      () => logger.info({ job: id, status: "ok", duration_ms: Date.now() - started }, "background job"),
      () => logger.error({ job: id, status: "failed", duration_ms: Date.now() - started }, "background job"),
    ).then(() => { running.delete(id); });
    running.set(id, promise);
    return promise;
  }
  async function stop(timeoutMs = SHUTDOWN_TIMEOUT_MS): Promise<boolean> {
    stopped = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const completed = await Promise.race([
      Promise.all([...running.values()]).then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs); }),
    ]);
    if (timer) clearTimeout(timer);
    if (!completed) logger.warn({ jobs: [...running.keys()], status: "shutdown_timeout" }, "background jobs");
    return completed;
  }
  return { run, stop };
}

export function scheduledJobs(): Job[] {
  return [
    { id: "points-decay", schedule: "0 3 1 * *", run: () => runDecay() },
    { id: "dpo-sync", schedule: "0 5 * * *", enabled: env.DPO_SYNC_ENABLED === "true", run: syncDpoCatalog },
    { id: "event-reminders", schedule: "0 10 * * *", run: runEventReminders },
    { id: "podcast-reminders", schedule: "0 11 * * *", run: runPodcastSubReminders },
    { id: "retention", schedule: "0 4 * * *", run: async () => { await purgeSupport(); await runRetention(); } },
    { id: "reserve-expiry", schedule: "*/15 * * * *", run: () => expireStaleReservations() },
    { id: "mail-outbox", schedule: "*/5 * * * *", run: drainMailOutbox },
    { id: "news-sync", schedule: "17 * * * *", enabled: env.NEWS_SYNC_ENABLED === "true", run: async () => {
      const results = await Promise.allSettled((["alumni", "career", "telegram"] as const).map(source => refreshNewsSource(source)));
      if (results.some(result => result.status === "rejected")) throw new Error("news sync failed");
    } },
  ];
}

export async function startBackgroundJobs(logger: JobLogger) {
  const runner = createJobRunner(logger);
  if (env.JOBS_ENABLED === "false") {
    logger.info({ status: "disabled" }, "background jobs");
    return { stop: () => runner.stop() };
  }
  const tasks = scheduledJobs().filter(job => job.enabled !== false).map(job => {
    logger.info({ job: job.id, schedule: job.schedule, timezone: JOB_TIMEZONE }, "background job scheduled");
    return cron.schedule(job.schedule, () => runner.run(job.id, job.run), { timezone: JOB_TIMEZONE });
  });
  await runner.run("support-startup-retention", purgeSupport);
  if (env.TELEGRAM_BOT_TOKEN) void runner.run("telegram-commands", () => registerBotCommands(env.TELEGRAM_BOT_TOKEN));
  const stopPolling = startTelegramPolling();
  return { stop: async () => {
    await Promise.all(tasks.map(task => task.destroy()));
    void runner.run("telegram-polling-shutdown", stopPolling);
    return runner.stop();
  } };
}
