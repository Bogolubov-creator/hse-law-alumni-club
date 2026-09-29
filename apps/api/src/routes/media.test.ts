import { beforeEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import { registerErrorHandler } from "../lib/errors.js";
import { MediaError, mediaStore } from "../lib/media-store.js";
import { registerMediaRoutes } from "./media.js";

vi.mock("../lib/auth.js",() => ({requireAdmin:vi.fn(async (req,reply) => {
  if(req.headers.authorization!=="Bearer editor") {reply.code(401).send({error:"Требуется вход администратора"});return null;}
  return {userId:"22222222-2222-4222-8222-222222222222",role:"editor"};
})}));
vi.mock("../lib/audit.js",() => ({audit:vi.fn()}));
const ID="11111111-1111-4111-8111-111111111111";
const authorization={authorization:"Bearer editor"};
async function build() {const app=Fastify();registerErrorHandler(app);await app.register(registerMediaRoutes);return app;}
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(mediaStore,"list").mockResolvedValue({items:[],total:0,page:1,limit:20});
  vi.spyOn(mediaStore,"isPublishedImage").mockResolvedValue(false);
  vi.spyOn(mediaStore,"isAvatar").mockResolvedValue(false);
  vi.spyOn(mediaStore,"get").mockResolvedValue({id:ID,storage:"local",filename_disk:"local.mp3",filename_download:"audio.mp3",type:"audio/mpeg",filesize:90,title:"Аудио",metadata:null,created_on:"2026-01-01"});
  vi.spyOn(mediaStore,"delete").mockResolvedValue();
  vi.spyOn(mediaStore,"stream").mockImplementation(async reply => reply.send("media"));
});

describe("media boundaries",() => {
  it("офисные чтение/удаление/preview/upload закрыты без сессии",async () => {
    const app=await build();
    for(const [method,url] of [["GET","/admin/media"],["DELETE",`/admin/media/${ID}`],["GET",`/admin/media/${ID}/content`],["POST","/admin/media"]] as const) {
      expect((await app.inject({method,url})).statusCode).toBe(401);
    }
    expect(mediaStore.list).not.toHaveBeenCalled();expect(mediaStore.delete).not.toHaveBeenCalled();expect(mediaStore.stream).not.toHaveBeenCalled();await app.close();
  });
  it("редактор получает ограниченную страницу, неверные размеры отклоняются",async () => {
    const app=await build();
    expect((await app.inject({url:"/admin/media?page=2&limit=10&q=photo",headers:authorization})).statusCode).toBe(200);
    expect(mediaStore.list).toHaveBeenCalledWith(2,10,"photo");
    expect((await app.inject({url:"/admin/media?limit=1000",headers:authorization})).statusCode).toBe(400);await app.close();
  });
  it("UUID закрытого файла не открывает публичную выдачу",async () => {
    const app=await build();expect((await app.inject(`/media/${ID}`)).statusCode).toBe(404);
    expect(mediaStore.stream).not.toHaveBeenCalled();await app.close();
  });
  it("после смены аватара метка запрещает публичную выдачу оригинала",async () => {
    vi.mocked(mediaStore.isPublishedImage).mockRestore();
    vi.mocked(mediaStore.get).mockResolvedValue({id:ID,storage:"local",filename_disk:"old-avatar.jpg",filename_download:"photo.jpg",type:"image/jpeg",filesize:90,title:"Фото",metadata:{club_upload_kind:"avatar"},created_on:"2026-01-01"});
    const app=await build();
    expect((await app.inject(`/media/${ID}`)).statusCode).toBe(404);
    expect(mediaStore.stream).not.toHaveBeenCalled();await app.close();
  });
  it("публичная выдача требует опубликованную картинку и передаёт Range",async () => {
    vi.mocked(mediaStore.isPublishedImage).mockResolvedValue(true);
    const app=await build();expect((await app.inject({url:`/media/${ID}`,headers:{range:"bytes=0-30"}})).statusCode).toBe(200);
    expect(mediaStore.stream).toHaveBeenCalledWith(expect.anything(),ID,{kind:"image",range:"bytes=0-30",cache:"public, max-age=300"});await app.close();
  });
  it("media manager не открывает и не удаляет аватары",async () => {
    vi.mocked(mediaStore.isAvatar).mockResolvedValue(true);
    const app=await build();
    expect((await app.inject({url:`/admin/media/${ID}/content`,headers:authorization})).statusCode).toBe(404);
    expect((await app.inject({method:"DELETE",url:`/admin/media/${ID}`,headers:authorization})).statusCode).toBe(404);
    expect(mediaStore.delete).not.toHaveBeenCalled();expect(mediaStore.stream).not.toHaveBeenCalled();await app.close();
  });
  it("используемый файл возвращает 409 с понятным сообщением",async () => {
    vi.mocked(mediaStore.delete).mockRejectedValue(new MediaError(409,"Файл используется"));
    const app=await build();const result=await app.inject({method:"DELETE",url:`/admin/media/${ID}`,headers:authorization});
    expect(result.statusCode).toBe(409);expect(result.json().error).toBe("Файл используется");await app.close();
  });
});
