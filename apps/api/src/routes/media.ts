import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAdmin } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { MAX_AUDIO_BYTES, mediaStore } from "../lib/media-store.js";

const params = z.object({ fileId:z.string().uuid() });

export async function registerMediaRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits:{ fileSize:MAX_AUDIO_BYTES, files:1, fields:0, parts:1 } });

  app.get("/media/:fileId", async (req, reply) => {
    const { fileId } = params.parse(req.params);
    if (!await mediaStore.isPublishedImage(fileId)) return reply.code(404).send({ error:"Файл не найден" });
    return mediaStore.stream(reply,fileId,{ kind:"image", range:req.headers.range, cache:"public, max-age=300" });
  });

  app.get("/admin/media", async (req, reply) => {
    if (!await requireAdmin(req,reply)) return;
    const query = z.object({ page:z.coerce.number().int().min(1).max(100000).default(1), limit:z.coerce.number().int().min(1).max(100).default(20), q:z.string().max(120).default("") }).parse(req.query);
    return mediaStore.list(query.page,query.limit,query.q);
  });

  app.post("/admin/media", { bodyLimit:MAX_AUDIO_BYTES+1024*1024, config:{ rateLimit:{ max:8,timeWindow:"1 minute" } } }, async (req, reply) => {
    const actor = await requireAdmin(req,reply);
    if (!actor) return;
    const upload = await req.file();
    if (!upload) return reply.code(400).send({ error:"Выберите файл" });
    const file = await mediaStore.save(upload.file,{ filename:upload.filename, uploadedBy:actor.userId, kind:"office" });
    audit("media.upload",{ actor:`admin:${actor.userId}`,subject:`file:${file.id}`,detail:{ size:Number(file.filesize),type:file.type },req });
    return reply.code(201).send({ id:file.id, filename:file.filename_download, type:file.type, size:Number(file.filesize) });
  });

  app.get("/admin/media/:fileId/content", async (req,reply) => {
    if (!await requireAdmin(req,reply)) return;
    const { fileId } = params.parse(req.params);
    const file = await mediaStore.get(fileId);
    if (!file || file.metadata?.club_upload_kind === "avatar" || await mediaStore.isAvatar(fileId)) return reply.code(404).send({ error:"Файл не найден" });
    return mediaStore.stream(reply,fileId,{ kind:file.type.startsWith("image/") ? "image" : "audio",range:req.headers.range });
  });

  app.delete("/admin/media/:fileId", async (req,reply) => {
    const actor = await requireAdmin(req,reply);
    if (!actor) return;
    const { fileId } = params.parse(req.params);
    const file = await mediaStore.get(fileId);
    if (file?.metadata?.club_upload_kind === "avatar" || await mediaStore.isAvatar(fileId)) return reply.code(404).send({ error:"Файл не найден" });
    await mediaStore.delete(fileId);
    audit("media.delete",{ actor:`admin:${actor.userId}`,subject:`file:${fileId}`,req });
    return { ok:true };
  });
}
