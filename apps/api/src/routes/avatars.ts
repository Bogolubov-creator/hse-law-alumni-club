import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { readItems, updateItem } from "@directus/sdk";
import { z } from "zod";
import { env } from "../env.js";
import { directus } from "../lib/directus.js";
import { resolveAlumni } from "../lib/auth.js";
import { audit } from "../lib/audit.js";

const di = directus;
const MAX_AVATAR_BYTES = 3 * 1024 * 1024; // 3 МБ достаточно для фото профиля
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Аватары выпускников. Файл хранится в Directus Files (том uploads),
 * наружу раздаётся ТОЛЬКО через наш прокси /avatars/:fileId – Directus
 * по-прежнему не светится публично, а старый файл удаляется при замене.
 */
export async function avatarsRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: MAX_AVATAR_BYTES, files: 1 } });

  app.post("/me/avatar", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const me = await resolveAlumni(req);
    if (!me) return reply.code(401).send({ error: "Не авторизован" });
    if (me.verification_status !== "verified") return reply.code(403).send({ error: "Доступно после верификации" });

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Прикрепите файл изображения" });
    if (!ALLOWED.has(file.mimetype)) return reply.code(400).send({ error: "Поддерживаются JPEG, PNG или WebP" });

    let buf: Buffer;
    try {
      buf = await file.toBuffer(); // лимит размера контролирует multipart
    } catch {
      return reply.code(400).send({ error: "Файл больше 3 МБ" });
    }

    // Загрузка в Directus Files сервисным токеном.
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buf)], { type: file.mimetype }), `avatar-${me.id}.${file.mimetype.split("/")[1]}`);
    const up = await fetch(`${env.DIRECTUS_URL}/files`, {
      method: "POST",
      headers: { authorization: `Bearer ${env.DIRECTUS_SERVICE_TOKEN}` },
      body: fd,
    });
    if (!up.ok) {
      req.log.error({ status: up.status }, "avatar upload to directus failed");
      return reply.code(502).send({ error: "Не удалось сохранить файл" });
    }
    const fileId = ((await up.json()) as any)?.data?.id as string | undefined;
    if (!fileId) return reply.code(502).send({ error: "Не удалось сохранить файл" });

    // Старый аватар подчищаем (не копим мусор в uploads).
    if (me.avatar) {
      await fetch(`${env.DIRECTUS_URL}/files/${me.avatar}`, {
        method: "DELETE", headers: { authorization: `Bearer ${env.DIRECTUS_SERVICE_TOKEN}` },
      }).catch(() => undefined);
    }
    await di.request((updateItem as any)("alumni", me.id, { avatar: fileId }));
    audit("avatar.upload", { actor: `alumni:${me.id}`, detail: { fileId, size: buf.length }, req });
    return { ok: true, avatar: fileId };
  });

  // Публичная раздача аватара через прокси (кэшируется браузером на сутки).
  app.get("/avatars/:fileId", async (req, reply) => {
    const { fileId } = z.object({ fileId: z.string().uuid() }).parse(req.params);
    // Отдаём только файлы, реально являющиеся чьим-то аватаром (не произвольные uploads).
    const rows = (await di.request((readItems as any)("alumni", { filter: { avatar: { _eq: fileId } }, limit: 1, fields: ["id"] }))) as any[];
    if (!rows.length) return reply.code(404).send({ error: "Не найдено" });

    const res = await fetch(`${env.DIRECTUS_URL}/assets/${fileId}?width=256&height=256&fit=cover&quality=80`, {
      headers: { authorization: `Bearer ${env.DIRECTUS_SERVICE_TOKEN}` },
    });
    if (!res.ok || !res.body) return reply.code(404).send({ error: "Не найдено" });
    reply.header("Content-Type", res.headers.get("content-type") ?? "image/jpeg");
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(Buffer.from(await res.arrayBuffer()));
  });
}
