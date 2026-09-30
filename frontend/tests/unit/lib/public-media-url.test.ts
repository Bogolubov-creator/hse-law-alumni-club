import { describe, expect, it } from "vitest";
import { mediaUrl } from "../../../src/lib/public-url.js";
const ID="11111111-1111-4111-8111-111111111111";
describe("local media URL",() => {
  it("сохраняет UUID и старый абсолютный CMS адрес без внешнего запроса",() => {
    expect(mediaUrl(ID)).toBe(`/api/media/${ID}`);
    expect(mediaUrl(`https://old-cms.example/assets/${ID}?width=300`)).toBe(`/api/media/${ID}`);
    expect(mediaUrl(`/api/media/${ID}`)).toBe(`/api/media/${ID}`);
  });
  it("не меняет обычные внешние обложки и локальные API аватары",() => {
    expect(mediaUrl("https://images.example/photo.jpg")).toBe("https://images.example/photo.jpg");
    expect(mediaUrl(`/api/avatars/${ID}`)).toBe(`/api/avatars/${ID}`);
  });
});
