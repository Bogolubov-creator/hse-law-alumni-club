import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { AvatarThumbnails } from "../../../../src/modules/media/avatar-thumbnail.js";

async function portrait(orientation = 1) {
  const pixels = Buffer.alloc(80 * 160 * 3);
  for (let y = 0; y < 160; y++) for (let x = 0; x < 80; x++) {
    const offset = (y * 80 + x) * 3;
    pixels[offset + (x < 40 ? 0 : 2)] = 255;
  }
  return sharp(pixels, { raw: { width: 80, height: 160, channels: 3 } })
    .withMetadata({ orientation }).withExifMerge({ IFD0: { Artist: "Private author" } }).jpeg({ quality: 100 }).toBuffer();
}

describe("avatar thumbnails", () => {
  it("портрет обрезается до 256×256, исходные байты и EXIF не попадают в ответ", async () => {
    const original = await portrait();
    const before = Buffer.from(original);
    const result = await new AvatarThumbnails().render("portrait", async () => original);
    const metadata = await sharp(result).metadata();
    expect(metadata).toMatchObject({ width: 256, height: 256, format: "png" });
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined();
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
    expect(pixel(64, 128)[0]).toBeGreaterThan(240);
    expect(pixel(192, 128)[2]).toBeGreaterThan(240);
    expect(original).toEqual(before);
  });

  it("второй портрет поворачивается по EXIF перед обрезкой", async () => {
    const result = await new AvatarThumbnails().render("rotated", async () => portrait(6));
    const { data, info } = await sharp(result).raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 256, height: 256 });
    const top = (64 * info.width + 128) * info.channels;
    const bottom = (192 * info.width + 128) * info.channels;
    expect(data[top]).toBeGreaterThan(240); expect(data[bottom + 2]).toBeGreaterThan(240);
    expect((await sharp(result).metadata()).orientation).toBeUndefined();
  });

  it("большие размеры и повреждённые картинки отклоняются", async () => {
    const renderer = new AvatarThumbnails();
    const oversized = await sharp({ create: { width: 4001, height: 4000, channels: 3, background: "red" } }).png().toBuffer();
    await expect(renderer.render("large", async () => oversized)).rejects.toMatchObject({ statusCode: 415 });
    await expect(renderer.render("broken", async () => Buffer.from("not an image"))).rejects.toMatchObject({ statusCode: 415 });
  });

  it("одинаковые запросы разделяют обработку и ограниченный кэш", async () => {
    const bytes = await portrait();
    const load = vi.fn(async () => bytes);
    const renderer = new AvatarThumbnails();
    const results = await Promise.all(Array.from({ length: 8 }, () => renderer.render("same-version", load)));
    expect(load).toHaveBeenCalledTimes(1);
    expect(results.every(result => result === results[0])).toBe(true);
    expect(await renderer.render("same-version", load)).toBe(results[0]);
    expect(load).toHaveBeenCalledTimes(1);
    await renderer.render("changed-version", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("обрабатывает не более двух фото и отказывает при заполненной очереди", async () => {
    const renderer = new AvatarThumbnails();
    const bytes = await portrait();
    const gates: Array<() => void> = [];
    let active = 0, peak = 0;
    const jobs = Array.from({ length: 10 }, (_, index) => renderer.render(`photo-${index}`, async () => {
      active++; peak = Math.max(peak, active);
      if (index < 2) await new Promise<void>(resolve => gates.push(resolve));
      active--; return bytes;
    }));
    await expect(renderer.render("queue-overflow", async () => bytes)).rejects.toMatchObject({ statusCode: 503 });
    expect(gates).toHaveLength(2);
    gates.forEach(release => release());
    await Promise.all(jobs);
    expect(peak).toBe(2);
  });
});
