import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import type { Pool } from "pg";
import Fastify from "fastify";
import { registerErrorHandler } from "../../../../src/common/errors.js";
import { MediaStore, assertMediaReferences, mediaId, parseRange, type StoredFile } from "../../../../src/modules/media/media-store.js";

const ID = "11111111-1111-4111-8111-111111111111";
const PNG = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(80,1)]);
const MP3 = Buffer.concat([Buffer.from("ID3"),Buffer.alloc(90,7)]);
let directory:string;
let files:Map<string,StoredFile>;
let store:MediaStore;
let query:ReturnType<typeof vi.fn>;
let inUse:boolean;
let insertionFails:boolean;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(),"club-media-"));
  files = new Map(); inUse=false; insertionFails=false;
  query = vi.fn(async (sql:string,args:unknown[] = []) => {
    if (sql.startsWith("INSERT INTO directus_files")) {
      if (insertionFails) throw new Error("database unavailable");
      const file = { id:args[0],storage:"local",filename_disk:args[1],filename_download:args[2],title:args[2],type:args[3],filesize:args[5],metadata:JSON.parse(args[6] as string),created_on:new Date().toISOString() } as StoredFile;
      files.set(file.id,file); return { rows:[file] };
    }
    if (sql.startsWith("SELECT * FROM directus_files")) return { rows:files.has(args[0] as string) ? [files.get(args[0] as string)] : [] };
    if (sql.startsWith("DELETE FROM directus_files")) files.delete(args[0] as string);
    if (sql.includes('source WHERE')) return { rows:inUse ? [{id:"content"}] : [] };
    return { rows:[] };
  });
  const db = { query,release:vi.fn() };
  store = new MediaStore({ directory:() => directory,pool:() => ({query,connect:async () => db}) as unknown as Pool });
});
afterEach(async () => { await rm(directory,{recursive:true,force:true}); });

async function fixture(bytes:Buffer,filename=`${ID}.png`) {
  files.set(ID,{ id:ID,storage:"local",filename_disk:filename,filename_download:"legacy.png",title:"Legacy",type:"image/png",filesize:bytes.length,created_on:"2026-01-01",metadata:null });
  if (!filename.includes("/")) await writeFile(join(directory,filename),bytes);
}
async function get(kind:"image"|"audio",range?:string) {
  const app=Fastify();registerErrorHandler(app);
  app.get("/file",(_,reply) => store.stream(reply,ID,{kind,range}));
  const result=await app.inject("/file");await app.close();return result;
}

describe("local upload",() => {
  it("определяет тип по байтам, сохраняет UUID и не использует присланный путь",async () => {
    const file=await store.save(Readable.from([PNG]),{filename:"../../outside.html",kind:"office"});
    expect(file.type).toBe("image/png");expect(file.filename_disk).toMatch(/^[\da-f-]{36}\.png$/);
    expect(file.filename_download).toBe("outside.html");
    expect(await readFile(join(directory,file.filename_disk))).toEqual(PNG);
  });
  it("отклоняет HTML/SVG и не оставляет файл",async () => {
    for (const body of ['<html><script>bad()</script></html>','<svg onload="bad()"></svg>']) {
      await expect(store.save(Readable.from([Buffer.from(body)]),{filename:"cover.png",kind:"office"})).rejects.toMatchObject({statusCode:415});
    }
    expect(await readdir(directory)).toEqual([]);expect(files.size).toBe(0);
  });
  it("ограничивает размер и обнаруживает усечённый multipart",async () => {
    await expect(store.save(Readable.from([PNG]),{filename:"big.png",kind:"office",maxBytes:12})).rejects.toMatchObject({statusCode:413});
    const truncated=Object.assign(Readable.from([PNG]),{truncated:true});
    await expect(store.save(truncated,{filename:"cut.png",kind:"office"})).rejects.toMatchObject({statusCode:413});
    expect(await readdir(directory)).toEqual([]);
  });
  it("не оставляет физический файл при ошибке SQL",async () => {
    insertionFails=true;
    await expect(store.save(Readable.from([PNG]),{filename:"cover.png",kind:"office"})).rejects.toThrow("database unavailable");
    expect(await readdir(directory)).toEqual([]);
  });
  it("аудио нельзя загрузить как avatar",async () => {
    await expect(store.save(Readable.from([MP3]),{filename:"photo.jpg",kind:"avatar"})).rejects.toMatchObject({statusCode:415});
  });
});

describe("local streaming",() => {
  it("сохраняет legacy имя файла и возвращает настоящие байты",async () => {
    await fixture(PNG,"legacy-original.png");const result=await get("image");
    expect(result.statusCode).toBe(200);expect(result.rawPayload).toEqual(PNG);
    expect(result.headers["content-type"]).toBe("image/png");expect(result.headers["x-content-type-options"]).toBe("nosniff");
  });
  it("не читает путь за пределами uploads",async () => {
    await fixture(PNG,"../outside.png");expect((await get("image")).statusCode).toBe(404);
  });
  it("не следует символической ссылке",async () => {
    const outside=await mkdtemp(join(tmpdir(),"club-media-outside-"));
    try {
      await fixture(PNG);await rm(join(directory,`${ID}.png`));
      await writeFile(join(outside,"private.png"),PNG);await symlink(join(outside,"private.png"),join(directory,`${ID}.png`));
      expect((await get("image")).statusCode).toBe(404);
    } finally { await rm(outside,{recursive:true,force:true}); }
  });
  it("Content-Type в БД не превращает HTML в картинку",async () => {
    await fixture(Buffer.from("<html><script>bad()</script></html>"));expect((await get("image")).statusCode).toBe(404);
  });
  it("Range читает нужный участок аудио, audio не отдаётся как image",async () => {
    await fixture(MP3);const result=await get("audio","bytes=10-19");
    expect(result.statusCode).toBe(206);expect(result.rawPayload).toEqual(MP3.subarray(10,20));
    expect(result.headers["content-range"]).toBe(`bytes 10-19/${MP3.length}`);
    expect((await get("image")).statusCode).toBe(404);
  });
  it("невалидный Range возвращает 416",async () => {
    await fixture(MP3);const result=await get("audio","bytes=9999-");
    expect(result.statusCode).toBe(416);expect(result.headers["content-range"]).toBe(`bytes */${MP3.length}`);
  });
});

it("используемый файл не удаляется; после снятия ссылок удаляются файл и metadata",async () => {
  await fixture(PNG);inUse=true;
  await expect(store.delete(ID)).rejects.toMatchObject({statusCode:409});
  expect(await readFile(join(directory,`${ID}.png`))).toEqual(PNG);expect(files.has(ID)).toBe(true);
  inUse=false;await store.delete(ID);expect(files.has(ID)).toBe(false);expect(await readdir(directory)).toEqual([]);
});
it("write guard проверяет ссылки под блокировкой",async () => {
  await expect(assertMediaReferences({query} as never,"programs",{cover:`/api/media/${ID}`})).rejects.toMatchObject({statusCode:400});
  expect(query.mock.calls[0]?.[0]).toContain('LOCK TABLE "programs"');expect(query.mock.calls[1]?.[0]).toContain("FOR SHARE");
});
it("аватар нельзя назначить обложкой или вложить в текст материала",async () => {
  for (const avatar of [
    { id:ID,upload_kind:"avatar",is_avatar:false },
    { id:ID,upload_kind:null,is_avatar:true },
  ]) {
    const database={query:vi.fn(async (sql:string) => ({rows:sql.startsWith("SELECT") ? [avatar] : []}))};
    await expect(assertMediaReferences(database as never,"events",{cover:ID})).rejects.toMatchObject({statusCode:400});
    await expect(assertMediaReferences(database as never,"news",{body:`<img src="/api/media/${ID}">`})).rejects.toMatchObject({statusCode:400});
    await expect(assertMediaReferences(database as never,"alumni",{avatar:ID})).resolves.toBeUndefined();
  }
});
it("старый avatar с опубликованной ссылкой не раскрывает оригинал после снятия с профиля",async () => {
  await fixture(PNG);
  files.get(ID)!.metadata={club_upload_kind:"avatar"};
  inUse=true;
  expect(await store.isAvatar(ID)).toBe(false);
  expect(await store.isPublishedImage(ID)).toBe(false);
  expect(query.mock.calls.some(([sql]) => sql.includes('source WHERE status=\'published\''))).toBe(false);
});
it("текущий legacy avatar без метки тоже закрыт для публичной выдачи оригинала",async () => {
  await fixture(PNG);inUse=true;
  vi.spyOn(store,"isAvatar").mockResolvedValue(true);
  expect(await store.isPublishedImage(ID)).toBe(false);
});
it("старые assets URL распознаются локально",() => {
  expect(mediaId(`https://old-cms.example/assets/${ID}?width=400`)).toBe(ID);
  expect(mediaId(`/api/media/${ID}`)).toBe(ID);expect(mediaId("javascript:alert(1)")).toBeNull();
});
it("Range поддерживает suffix, open end и отвергает несколько диапазонов",() => {
  expect(parseRange("bytes=-4",10)).toEqual({start:6,end:9});
  expect(parseRange("bytes=2-",10)).toEqual({start:2,end:9});
  expect(parseRange("bytes=0-2,4-6",10)).toBe(false);
});
