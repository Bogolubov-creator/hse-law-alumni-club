import { describe, it, expect } from "vitest";
import { rutubeEmbed } from "./rutube.js";

const ID = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

describe("rutubeEmbed – ссылка из админки", () => {
  it("обычное видео превращается в адрес плеера", () => {
    expect(rutubeEmbed(`https://rutube.ru/video/${ID}/`)).toEqual({
      src: `https://rutube.ru/play/embed/${ID}`,
      private: false,
    });
  });

  it("видео из закрытой папки сохраняет токен доступа", () => {
    const r = rutubeEmbed(`https://rutube.ru/video/private/${ID}/?p=Zx-9_ABC`);
    expect(r).toEqual({ src: `https://rutube.ru/play/embed/${ID}?p=Zx-9_ABC`, private: true });
  });

  it("готовый embed принимается как есть", () => {
    expect(rutubeEmbed(`https://rutube.ru/play/embed/${ID}`)?.src).toBe(`https://rutube.ru/play/embed/${ID}`);
  });

  it("лишние параметры адреса отбрасываются", () => {
    // ?t=120 и utm-метки в src плеера не нужны и только мешают
    expect(rutubeEmbed(`https://rutube.ru/video/${ID}/?t=120&utm_source=tg`)?.src)
      .toBe(`https://rutube.ru/play/embed/${ID}`);
  });

  it("пустое значение – это просто отсутствие видео", () => {
    expect(rutubeEmbed(null)).toBeNull();
    expect(rutubeEmbed("")).toBeNull();
    expect(rutubeEmbed("   ")).toBeNull();
  });
});

/**
 * Значение поля уходит в `src` айфрейма, поэтому разбор обязан быть глухим
 * ко всему, что не RuTube. Каждый случай ниже – это попытка подставить чужой
 * или опасный адрес через админку.
 */
describe("rutubeEmbed – чужие и опасные адреса не проходят", () => {
  const bad = [
    ["javascript-схема", "javascript:alert(1)"],
    ["data-схема", "data:text/html,<script>alert(1)</script>"],
    ["http вместо https", `http://rutube.ru/video/${ID}/`],
    ["чужой домен", `https://example.org/video/${ID}/`],
    ["домен-подделка", `https://rutube.ru.evil.com/video/${ID}/`],
    ["домен с приставкой", `https://notrutube.ru/video/${ID}/`],
    ["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["не тот путь", `https://rutube.ru/channel/${ID}/`],
    ["идентификатор не тот", "https://rutube.ru/video/not-an-id/"],
    ["вообще не ссылка", "просто текст"],
  ] as const;

  for (const [name, url] of bad) {
    it(`${name} – null`, () => expect(rutubeEmbed(url)).toBeNull());
  }

  it("поддомен RuTube допускается, но путь всё равно проверяется", () => {
    expect(rutubeEmbed(`https://rutube.ru/video/${ID}/`)).not.toBeNull();
    expect(rutubeEmbed("https://rutube.ru/")).toBeNull();
  });

  it("мусор в токене доступа не попадает в адрес", () => {
    // Иначе через `p` можно было бы дописать в src произвольную строку
    const r = rutubeEmbed(`https://rutube.ru/video/private/${ID}/?p="><script>`);
    expect(r?.src).toBe(`https://rutube.ru/play/embed/${ID}`);
    expect(r?.src).not.toContain("script");
  });
});
