import sharp from "sharp";

const MAX_INPUT_PIXELS = 16_000_000;
const MAX_RENDERING = 2;
const MAX_WAITING = 8;
const CACHE_ENTRIES = 64;
const CACHE_BYTES = 16 * 1024 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;

export class AvatarThumbnailError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

export class AvatarThumbnails {
  private active = 0;
  private waiting: Array<() => void> = [];
  private pending = new Map<string, Promise<Buffer>>();
  private cached = new Map<string, { bytes: Buffer; expires: number }>();
  private cachedBytes = 0;

  private async acquire() {
    if (this.active < MAX_RENDERING) { this.active++; return; }
    if (this.waiting.length >= MAX_WAITING) throw new AvatarThumbnailError(503, "Обработка фотографий занята. Попробуйте позже.");
    await new Promise<void>(resolve => { this.waiting.push(resolve); });
  }

  private release() {
    const next = this.waiting.shift();
    if (next) next();
    else this.active--;
  }

  private forget(key: string) {
    const entry = this.cached.get(key);
    if (entry) { this.cachedBytes -= entry.bytes.length; this.cached.delete(key); }
  }

  render(key: string, load: () => Promise<Buffer>): Promise<Buffer> {
    const cached = this.cached.get(key);
    if (cached && cached.expires > Date.now()) {
      this.cached.delete(key); this.cached.set(key, cached);
      return Promise.resolve(cached.bytes);
    }
    this.forget(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const rendered = this.create(load).then(bytes => {
      this.cached.set(key, { bytes, expires: Date.now() + CACHE_TTL_MS });
      this.cachedBytes += bytes.length;
      while (this.cached.size > CACHE_ENTRIES || this.cachedBytes > CACHE_BYTES) this.forget(this.cached.keys().next().value!);
      return bytes;
    }).finally(() => { this.pending.delete(key); });
    this.pending.set(key, rendered);
    return rendered;
  }

  private async create(load: () => Promise<Buffer>): Promise<Buffer> {
    await this.acquire();
    try {
      const source = await load();
      try {
        // Без keepMetadata(): EXIF/ICC/XMP не попадают в публичную копию.
        return await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, animated: false, pages: 1, failOn: "warning" })
          .rotate().resize(256, 256, { fit: "cover", position: "centre" })
          .png().timeout({ seconds: 3 }).toBuffer();
      } catch { throw new AvatarThumbnailError(415, "Не удалось прочитать изображение или оно превышает 16 мегапикселей"); }
    } finally { this.release(); }
  }
}

export const avatarThumbnails = new AvatarThumbnails();
