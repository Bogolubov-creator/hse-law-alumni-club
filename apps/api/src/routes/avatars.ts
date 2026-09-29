import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { updateItem } from "../lib/data-commands.js";
import { z } from "zod";
import { data } from "../lib/data.js";
import { resolveAlumni } from "../lib/auth.js";
import { audit } from "../lib/audit.js";
import { deleteStoredFile, MediaError, mediaStore } from "../lib/media-store.js";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function avatarsRoutes(app: FastifyInstance) {
  await app.register(multipart,{ limits:{ fileSize:MAX_AVATAR_BYTES, files:1, fields:0, parts:1 } });
  app.post("/me/avatar",{ bodyLimit:4*1024*1024, config:{ rateLimit:{ max:10,timeWindow:"1 minute" } } },async (req,reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error:"Не авторизован" });
    if (me.verification_status === "rejected") return reply.code(403).send({ error:"Заявка отклонена – загрузка фото недоступна" });
    if (me.verification_status !== "verified" && me.verification_status !== "pending") return reply.code(403).send({ error:"Доступно после подачи заявки" });
    const upload = await req.file();
    if (!upload) return reply.code(400).send({ error:"Прикрепите файл изображения" });
    if (!ALLOWED.has(upload.mimetype)) return reply.code(400).send({ error:"Поддерживаются JPEG, PNG или WebP" });
    let file;
    try {
      file = await mediaStore.save(upload.file,{ filename:`avatar-${me.id}`,kind:"avatar",maxBytes:MAX_AVATAR_BYTES });
    } catch (error) {
      if (error instanceof MediaError && [413,415].includes(error.statusCode)) {
        audit("avatar.reject",{ actor:`alumni:${me.id}`,detail:{ declared:upload.mimetype },req });
        return reply.code(400).send({ error:error.statusCode === 413 ? "Файл больше 3 МБ" : "Это не изображение JPEG, PNG или WebP" });
      }
      throw error;
    }
    // Новая ссылка сохраняется первой: сбой профиля не затрагивает старый файл.
    try { await data.request(updateItem("alumni",me.id,{ avatar:file.id })); }
    catch (error) { await deleteStoredFile(file.id).catch(() => undefined); throw error; }
    if (me.avatar && me.avatar !== file.id) await deleteStoredFile(me.avatar).catch(() => req.log.warn({ fileId:me.avatar },"Не удалось удалить прежний аватар"));
    audit("avatar.upload",{ actor:`alumni:${me.id}`,detail:{ fileId:file.id,size:Number(file.filesize) },req });
    return { ok:true,avatar:file.id };
  });

  app.get("/avatars/:fileId",async (req,reply) => {
    const { fileId } = z.object({ fileId:z.string().uuid() }).parse(req.params);
    if (!await mediaStore.isAvatar(fileId)) return reply.code(404).send({ error:"Не найдено" });
    return mediaStore.streamAvatar(reply,fileId);
  });
}
