import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, rm, statfs } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import type { Pool, PoolClient } from "pg";
import type { FastifyReply } from "fastify";
import { checkoutPool } from "./checkout-store.js";
import { avatarThumbnails, AvatarThumbnailError } from "./avatar-thumbnail.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 128 * 1024 * 1024;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADER_BYTES = 512;
const DISK_RESERVE_BYTES = 64 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/ogg": "ogg", "audio/mp4": "m4a",
};
type Queryable = Pick<PoolClient, "query">;
export type StoredFile = {
  id: string; storage: string; filename_disk: string; filename_download: string;
  title: string | null; type: string; filesize: string | number; created_on: string;
  metadata: Record<string, unknown> | null;
};
export class MediaError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

/** Старые абсолютные ссылки CMS переводятся в локальный UUID без сетевого запроса. */
export function mediaId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (UUID_PATTERN.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value, "http://media.local");
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const match = /^\/(?:api\/media|assets)\/([0-9a-f-]{36})(?:\/[^/]*)?\/?$/i.exec(url.pathname);
    return match && UUID_PATTERN.test(match[1]!) ? match[1]!.toLowerCase() : null;
  } catch { return null; }
}

export function sniffMedia(header: Buffer): string | null {
  if (header.length < 12) return null;
  if (header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) return "image/jpeg";
  if (header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "image/png";
  const start = header.subarray(0, 4).toString("latin1");
  if (start === "RIFF" && header.subarray(8,12).toString("latin1") === "WEBP") return "image/webp";
  if (/^GIF8[79]a/.test(header.subarray(0,6).toString("latin1"))) return "image/gif";
  if (header.subarray(4,8).toString("latin1") === "ftyp") {
    const brands = header.subarray(8,40).toString("latin1");
    if (/avif|avis/.test(brands)) return "image/avif";
    if (/M4A |M4B |isom|mp42/.test(brands)) return "audio/mp4";
  }
  if (start === "RIFF" && header.subarray(8,12).toString("latin1") === "WAVE") return "audio/wav";
  if (start === "OggS" && /OpusHead|vorbis/.test(header.toString("latin1"))) return "audio/ogg";
  if (header.subarray(0,3).toString("latin1") === "ID3" || (header[0] === 0xff && (header[1]! & 0xe6) === 0xe2)) return "audio/mpeg";
  return null;
}

// Поля, в которых уже хранятся UUID/URL. Тексты тоже проверяются при удалении:
// старые статьи могут содержать картинки внутри HTML или Markdown.
const MEDIA_FIELDS: Record<string, string[]> = {
  alumni: ["avatar"], events: ["cover", "description"], news: ["body"],
  podcasts: ["cover", "audio_url", "description"], products: ["images", "description"],
  programs: ["cover", "teachers", "modules", "description", "results", "advantages", "audience"],
};
const TABLES = Object.keys(MEDIA_FIELDS).sort();
function references(alias: string, table: string, parameter: string): string {
  return MEDIA_FIELDS[table]!.map(field => `strpos(COALESCE(${alias}."${field}"::text,''), ${parameter}) > 0`).join(" OR ");
}
function referencedIds(value: unknown, result = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    const id = mediaId(value);
    if (id) result.add(id);
    for (const match of value.matchAll(/\/(?:api\/media|assets)\/([0-9a-f-]{36})/gi)) {
      if (UUID_PATTERN.test(match[1]!)) result.add(match[1]!.toLowerCase());
    }
  } else if (Array.isArray(value)) for (const item of value) referencedIds(item, result);
  else if (value && typeof value === "object") for (const item of Object.values(value)) referencedIds(item, result);
  return result;
}

/** Вызывается adapter внутри той же транзакции перед INSERT/UPDATE. */
export async function assertMediaReferences(db: Queryable, table: string, input: Record<string, unknown>): Promise<void> {
  const fields = MEDIA_FIELDS[table];
  if (!fields) return;
  const ids = new Set<string>();
  for (const field of fields) if (field in input) referencedIds(input[field], ids);
  if (!ids.size) return;
  // В том же порядке, что и delete: сначала таблица контента, затем файлы.
  await db.query(`LOCK TABLE "${table}" IN ROW EXCLUSIVE MODE`);
  const { rows } = await db.query<{ id: string; upload_kind: string | null; is_avatar: boolean }>(`SELECT f.id, f.metadata->>'club_upload_kind' AS upload_kind,
    EXISTS(SELECT 1 FROM alumni a WHERE a.avatar=f.id::text) AS is_avatar
    FROM directus_files f WHERE f.id=ANY($1::uuid[]) ORDER BY f.id FOR SHARE OF f`, [[...ids].sort()]);
  if (rows.length !== ids.size) throw new MediaError(400, "Один из файлов удалён. Выберите файл заново.");
  if (table !== "alumni" && rows.some(file => file.upload_kind === "avatar" || file.is_avatar)) {
    throw new MediaError(400, "Фотографию профиля нельзя использовать в материалах. Загрузите отдельный файл в медиатеку.");
  }
}

export class MediaStore {
  constructor(private options: { pool?: () => Pool; directory?: () => string } = {}) {}
  private pool() { return this.options.pool?.() ?? checkoutPool(); }
  private async directory() {
    const directory = resolve(this.options.directory?.() ?? process.env.UPLOADS_PATH ?? "/data/uploads");
    await mkdir(directory, { recursive: true, mode: 0o750 });
    return realpath(directory);
  }
  private async diskPath(filename: string) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,254}$/.test(filename)) throw new MediaError(404, "Файл не найден");
    return join(await this.directory(), filename);
  }
  async get(id: string): Promise<StoredFile | null> {
    if (!UUID_PATTERN.test(id)) return null;
    const { rows } = await this.pool().query<StoredFile>("SELECT * FROM directus_files WHERE id=$1", [id]);
    return rows[0] ?? null;
  }
  async isAvatar(id: string): Promise<boolean> {
    const { rows } = await this.pool().query("SELECT id FROM alumni WHERE avatar=$1 LIMIT 1", [id]);
    return rows.length > 0;
  }
  async isPublishedImage(id: string): Promise<boolean> {
    const file = await this.get(id);
    // Метка сохраняется после смены фото: старый UUID не открывает оригинал с EXIF.
    if (!file || file.metadata?.club_upload_kind === "avatar") return false;
    if (await this.isAvatar(id)) return false;
    for (const table of TABLES.filter(table => table !== "alumni")) {
      const fields = MEDIA_FIELDS[table]!.filter(field => field !== "audio_url");
      const matching = fields.map(field => `strpos(COALESCE(source."${field}"::text,''), $1) > 0`).join(" OR ");
      const { rows } = await this.pool().query(`SELECT id FROM "${table}" source WHERE status='published' AND (${matching}) LIMIT 1`, [id]);
      if (rows.length) return true;
    }
    return false;
  }
  async list(page: number, limit: number, query: string) {
    const where = `NOT EXISTS(SELECT 1 FROM alumni a WHERE a.avatar=f.id::text)
      AND COALESCE(f.metadata->>'club_upload_kind','') <> 'avatar'
      AND (COALESCE(f.title,'') ILIKE $1 OR f.filename_download ILIKE $1)`;
    const pattern = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const { rows } = await this.pool().query<StoredFile>(`SELECT f.* FROM directus_files f WHERE ${where} ORDER BY f.created_on DESC,f.id LIMIT $2 OFFSET $3`, [pattern,limit,(page-1)*limit]);
    const total = await this.pool().query<{ count: string }>(`SELECT count(*) FROM directus_files f WHERE ${where}`, [pattern]);
    return { items: rows.map(file => ({ id:file.id, title:file.title, filename:file.filename_download, type:file.type, size:Number(file.filesize), created_at:file.created_on })), total:Number(total.rows[0]?.count ?? 0), page, limit };
  }
  async save(stream: Readable & { truncated?: boolean }, options: { filename: string; uploadedBy?: string | null; kind: "office" | "avatar"; maxBytes?: number }) {
    const directory = await this.directory();
    const maximum = options.maxBytes ?? MAX_AUDIO_BYTES;
    const disk = await statfs(directory);
    if (disk.bavail * disk.bsize < maximum + DISK_RESERVE_BYTES) throw new MediaError(507, "Недостаточно места для загрузки");
    const id = randomUUID();
    const temporary = join(directory, `${id}.upload`);
    let finalPath = temporary;
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let size = 0;
    let header = Buffer.alloc(0);
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (header.length < HEADER_BYTES) header = Buffer.concat([header, bytes.subarray(0, HEADER_BYTES-header.length)]);
        const type = sniffMedia(header);
        const limit = type?.startsWith("image/") ? Math.min(maximum, MAX_IMAGE_BYTES) : maximum;
        if (size > limit || stream.truncated) throw new MediaError(413, "Файл превышает допустимый размер");
        await handle.writeFile(bytes);
      }
      if (stream.truncated) throw new MediaError(413, "Файл превышает допустимый размер");
      const type = sniffMedia(header);
      if (!type || !UPLOAD_TYPES[type] || (options.kind === "avatar" && !IMAGE_TYPES.has(type))) throw new MediaError(415, "Поддерживаются JPEG, PNG, WebP, MP3, WAV, OGG и M4A");
      await handle.close();
      if (options.kind === "avatar") await this.thumbnailFile(`${id}.upload`);
      const filename = `${id}.${UPLOAD_TYPES[type]}`;
      finalPath = join(directory, filename);
      await rename(temporary, finalPath);
      const download = basename(options.filename.replaceAll("\\", "/")).split("").filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127).join("").slice(0,200) || filename;
      const { rows } = await this.pool().query<StoredFile>(`INSERT INTO directus_files
        (id,storage,filename_disk,filename_download,title,type,uploaded_by,uploaded_on,filesize,metadata)
        VALUES($1,'local',$2,$3,$3,$4,$5,now(),$6,$7::json) RETURNING *`,
      [id,filename,download,type,options.uploadedBy ?? null,size,JSON.stringify({ club_upload_kind:options.kind })]);
      return rows[0]!;
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(temporary, { force:true }).catch(() => undefined);
      if (finalPath !== temporary) await rm(finalPath, { force:true }).catch(() => undefined);
      throw error;
    }
  }
  async delete(id: string): Promise<void> {
    if (!UUID_PATTERN.test(id)) throw new MediaError(404, "Файл не найден");
    const db = await this.pool().connect();
    let path: string;
    try {
      await db.query("BEGIN");
      await db.query(`LOCK TABLE ${TABLES.map(table => `"${table}"`).join(",")} IN SHARE MODE`);
      const { rows } = await db.query<StoredFile>("SELECT * FROM directus_files WHERE id=$1 FOR UPDATE", [id]);
      const file = rows[0];
      if (!file) { await db.query("COMMIT"); return; }
      const shared = await db.query("SELECT id FROM directus_files WHERE storage=$1 AND filename_disk=$2 AND id<>$3 FOR SHARE",[file.storage,file.filename_disk,id]);
      if (shared.rows.length) throw new MediaError(409,"Файл связан с другой записью медиатеки");
      for (const table of TABLES) {
        const used = await db.query(`SELECT id FROM "${table}" source WHERE ${references("source", table, "$1")} LIMIT 1`, [id]);
        if (used.rows.length) throw new MediaError(409, "Файл используется. Сначала уберите его из материалов или профиля.");
      }
      if (file.storage !== "local") throw new MediaError(409, "Файл хранится вне локального каталога");
      path = await this.diskPath(file.filename_disk);
      await db.query("DELETE FROM directus_files WHERE id=$1", [id]);
      await db.query("COMMIT");
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
    await rm(path, { force:true });
  }
  private async thumbnailFile(filename: string): Promise<Buffer> {
    const handle = await open(await this.diskPath(filename), constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size || stat.size > MAX_IMAGE_BYTES) throw new MediaError(415, "Не удалось прочитать изображение");
      return await avatarThumbnails.render(`${await this.directory()}:${filename}:${stat.size}:${stat.mtimeMs}`, async () => {
        const bytes = await handle.readFile();
        if (!IMAGE_TYPES.has(sniffMedia(bytes.subarray(0, HEADER_BYTES)) ?? "")) throw new MediaError(415, "Не удалось прочитать изображение");
        return bytes;
      });
    } catch (error) {
      if (error instanceof AvatarThumbnailError) throw new MediaError(error.statusCode, error.message);
      throw error;
    } finally { await handle.close(); }
  }
  async streamAvatar(reply: FastifyReply, id: string) {
    const file = await this.get(id);
    if (!file || file.storage !== "local") return reply.code(404).send({ error:"Файл не найден" });
    let thumbnail: Buffer;
    try { thumbnail = await this.thumbnailFile(file.filename_disk); }
    catch (error) {
      if (error instanceof MediaError && error.statusCode === 503) throw error;
      return reply.code(404).send({ error:"Файл не найден" });
    }
    return reply.header("Content-Type", "image/png").header("X-Content-Type-Options", "nosniff")
      .header("Content-Security-Policy", "default-src 'none'; sandbox")
      .header("Cache-Control", "public, max-age=300").send(thumbnail);
  }
  async stream(reply: FastifyReply, id: string, options: { kind: "image" | "audio"; range?: string; cache?: string }) {
    const file = await this.get(id);
    if (!file || file.storage !== "local" || !file.filename_disk) return reply.code(404).send({ error:"Файл не найден" });
    let handle;
    try { handle = await open(await this.diskPath(file.filename_disk), constants.O_RDONLY | constants.O_NOFOLLOW); }
    catch { return reply.code(404).send({ error:"Файл не найден" }); }
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || !stat.size) throw new MediaError(404, "Файл не найден");
      const header = Buffer.alloc(HEADER_BYTES);
      const { bytesRead } = await handle.read(header, 0, HEADER_BYTES, 0);
      const detected = sniffMedia(header.subarray(0,bytesRead));
      if (!detected || (options.kind === "image" ? !IMAGE_TYPES.has(detected) : !detected.startsWith("audio/"))) throw new MediaError(404, "Файл не найден");
      const range = parseRange(options.range, stat.size);
      if (range === false) {
        await handle.close();
        return reply.code(416).header("Content-Range", `bytes */${stat.size}`).send();
      }
      reply.header("Content-Type",detected).header("X-Content-Type-Options","nosniff")
        .header("Content-Security-Policy","default-src 'none'; sandbox")
        .header("Cache-Control",options.cache ?? "private, no-store").header("Accept-Ranges","bytes");
      if (range) reply.code(206).header("Content-Range",`bytes ${range.start}-${range.end}/${stat.size}`);
      reply.header("Content-Length", range ? range.end-range.start+1 : stat.size);
      return reply.send(handle.createReadStream({ ...(range || {}), autoClose:true }));
    } catch (error) { await handle.close().catch(() => undefined); throw error; }
  }
}

export function parseRange(value: string | undefined, size: number): { start:number; end:number } | false | null {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  const suffix = !match[1];
  const first = Number(match[1] || match[2]);
  const last = match[2] && !suffix ? Number(match[2]) : size-1;
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || (suffix && first === 0)) return false;
  const start = suffix ? Math.max(0,size-first) : first;
  const end = Math.min(last,size-1);
  return start >= size || start > end ? false : { start,end };
}

export const mediaStore = new MediaStore();
export const deleteStoredFile = (id: string) => mediaStore.delete(id);
