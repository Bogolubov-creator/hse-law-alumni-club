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
 * Реальный тип по сигнатуре файла. Content-Type в multipart присылает клиент –
 * ему верить нельзя: под видом image/png уходил любой файл. Проверяем магические
 * байты и дальше используем ТОЛЬКО определённый здесь тип.
 */
function sniffImage(buf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  // WebP: "RIFF" .... "WEBP"
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

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
    // Фото можно загрузить до подтверждения выпуска; отклонённым – нет.
    if (me.verification_status === "rejected") return reply.code(403).send({ error: "Заявка отклонена – загрузка фото недоступна" });
    if (me.verification_status !== "verified" && me.verification_status !== "pending") {
      return reply.code(403).send({ error: "Доступно после подачи заявки" });
    }

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "Прикрепите файл изображения" });
    if (!ALLOWED.has(file.mimetype)) return reply.code(400).send({ error: "Поддерживаются JPEG, PNG или WebP" });

    let buf: Buffer;
    try {
      buf = await file.toBuffer(); // лимит размера контролирует multipart
    } catch {
      return reply.code(400).send({ error: "Файл больше 3 МБ" });
    }

    // Тип определяем по содержимому, а не по заголовку клиента.
    const realType = sniffImage(buf);
    if (!realType) {
      audit("avatar.reject", { actor: `alumni:${me.id}`, detail: { declared: file.mimetype, size: buf.length }, req });
      return reply.code(400).send({ error: "Это не изображение JPEG, PNG или WebP" });
    }

    // Загрузка в Directus Files сервисным токеном (тип – определённый по сигнатуре).
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(buf)], { type: realType }), `avatar-${me.id}.${EXT[realType]}`);
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
    // Тип отдаём только из белого списка: даже если в хранилище окажется что-то
    // иное, наружу оно не уйдёт как text/html.
    const upstream = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    reply.header("Content-Type", ALLOWED.has(upstream) ? upstream : "image/jpeg");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Cache-Control", "public, max-age=86400");
    return reply.send(Buffer.from(await res.arrayBuffer()));
  });
}
