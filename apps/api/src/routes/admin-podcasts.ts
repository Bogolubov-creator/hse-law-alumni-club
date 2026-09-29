import type { FastifyInstance } from "fastify";
import { readItems, createItem, updateItem, deleteItem } from "@directus/sdk";
import { z } from "zod";
import { directus } from "../lib/directus.js";
import { requireAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { pushToAll } from "../lib/push.js";
const di = directus;

export async function adminPodcastsRoutes(app: FastifyInstance) {


  /**
   * Подписки на подкасты: кто подписан, до какой даты, кто скоро истекает.
   * Отдельная ручка, а не фильтр по выпускникам: офису нужен срез именно по
   * подпискам, с сортировкой по дате окончания и статистикой прослушиваний.
   */
  app.get("/admin/podcast-subs", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const now = new Date().toISOString();
    const soon = new Date(Date.now() + 30 * 86400000).toISOString();

    const subs = (await di.request((readItems as any)("alumni", {
      filter: { podcast_sub_until: { _nnull: true } },
      sort: ["podcast_sub_until"], limit: -1,
      fields: ["id", "fio", "cohort", "podcast_sub_until", "podcast_reminder_sent", "contacts_json"],
    }))) as any[];

    const active = subs.filter((a) => a.podcast_sub_until > now);
    const items = active.map((a) => ({
      id: a.id, fio: a.fio, cohort: a.cohort,
      until: a.podcast_sub_until,
      days_left: Math.ceil((new Date(a.podcast_sub_until).getTime() - Date.now()) / 86400000),
      reminded: !!a.podcast_reminder_sent,
      email: a.contacts_json?.email ?? null,
    }));

    // Прослушивания: сводка по выпускам. Пишет их сервер при выдаче аудио,
    // поэтому цифры отражают реальные обращения, а не клики по странице.
    const plays = (await di.request((readItems as any)("podcast_plays", {
      limit: -1, fields: ["podcast_id", "alumni_id", "created_at"],
    }))) as any[];
    const podcasts = (await di.request((readItems as any)("podcasts", {
      limit: -1, sort: ["sort"], fields: ["id", "title", "is_free"],
    }))) as any[];

    const monthAgo = Date.now() - 30 * 86400000;
    const byPodcast = podcasts.map((p) => {
      const mine = plays.filter((x) => x.podcast_id === p.id);
      return {
        id: p.id, title: p.title, is_free: !!p.is_free,
        plays: mine.length,
        listeners: new Set(mine.map((x) => x.alumni_id ?? "гость")).size,
        plays_30d: mine.filter((x) => new Date(x.created_at).getTime() >= monthAgo).length,
      };
    }).sort((a, b) => b.plays - a.plays);

    return {
      active: items.length,
      expiring_30d: active.filter((a) => a.podcast_sub_until <= soon).length,
      expired: subs.length - active.length,
      items,
      plays_total: plays.length,
      by_podcast: byPodcast,
    };
  });


  // ── Подкасты ──────────────────────────────────────────────────────
  // Обложка: только http(s). Аудио: http(s) для внешнего хоста либо UUID
  // файла Directus (стрим через /api/podcasts/:id/audio).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const httpUrl = z.string().url().max(500).refine((u) => /^https?:\/\//i.test(u), "Ссылка должна начинаться с http:// или https://");

  const audioRef = z.string().max(500).refine(
    (u) => /^https?:\/\//i.test(u) || UUID_RE.test(u),
    "Укажите https://…/file.mp3 или UUID файла Directus",
  );

  const podcastBody = z.object({
    title: z.string().min(3),
    description: z.string().nullish(),
    cover: httpUrl.nullish().or(z.literal("").transform(() => null)),
    audio_url: audioRef.nullish().or(z.literal("").transform(() => null)),
    video_url: httpUrl.nullish().or(z.literal("").transform(() => null)),
    duration: z.string().nullish(),
    is_free: z.boolean().optional(), // пробный выпуск (без подписки)
    sort: z.number().int().optional(),
    status: z.enum(["draft", "published"]).default("published"),
  });


  app.get("/admin/podcasts", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return di.request(readItems("podcasts", { sort: ["sort"], limit: -1, fields: ["id", "title", "description", "cover", "audio_url", "video_url", "duration", "is_free", "sort", "status"] }));
  });


  /** UUID аудио не должен совпадать с alumni.avatar – иначе публичный прокси обходит /avatars. */
  const rejectAvatarAsAudio = async (audioUrl: string | null | undefined, reply: any): Promise<boolean> => {
    if (!audioUrl || !UUID_RE.test(audioUrl)) return false;
    const hits = (await di.request((readItems as any)("alumni", {
      filter: { avatar: { _eq: audioUrl } },
      limit: 1,
      fields: ["id"],
    }))) as any[];
    if (!hits.length) return false;
    reply.code(400).send({ error: "Этот файл – аватар выпускника, его нельзя указать как аудио выпуска" });
    return true;
  };


  app.post("/admin/podcasts", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const b = podcastBody.parse(req.body);
    if (await rejectAvatarAsAudio(b.audio_url, reply)) return;
    const all = (await di.request(readItems("podcasts", { fields: ["sort"], limit: -1 }))) as any[];
    const created = (await di.request((createItem as any)("podcasts", {
      ...b, description: b.description ?? null, cover: b.cover ?? null,
      audio_url: b.audio_url ?? null, video_url: b.video_url ?? null, duration: b.duration ?? null,
      sort: b.sort ?? Math.max(0, ...all.map((p) => p.sort || 0)) + 1,
    }))) as any;
    if (b.status === "published") pushToAll({ title: "Новый подкаст 🎧", body: b.title, url: "/podcasts" });
    audit("podcast.create", { actor: `admin:${ctx.userId}`, subject: `podcast:${created.id}`, detail: { title: b.title, is_free: b.is_free ?? false, status: b.status }, req });
    return { ok: true, id: created.id };
  });


  app.patch("/admin/podcasts/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = podcastBody.partial().parse(req.body);
    if (await rejectAvatarAsAudio(b.audio_url, reply)) return;
    await di.request((updateItem as any)("podcasts", id, b));
    // is_free снимает пейволл – правку обязательно видно в журнале.
    audit("podcast.patch", { actor: `admin:${ctx.userId}`, subject: `podcast:${id}`, detail: b, req });
    return { ok: true };
  });


  app.delete("/admin/podcasts/:id", async (req, reply) => {
    const ctx = requireAdmin(req, reply);
    if (!ctx) return;
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await di.request((deleteItem as any)("podcasts", id));
    audit("podcast.delete", { actor: `admin:${ctx.userId}`, subject: `podcast:${id}`, req });
    return { ok: true };
  });
}
