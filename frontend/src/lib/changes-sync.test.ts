import { describe, expect, it } from "vitest";
import { parseFeed, synchronize } from "../../scripts/sync-changes.js";
import { parseChanges, safeSourceUrl } from "./changes-schema.js";
import { selectChanges } from "./changes.js";

const now = "2026-09-22T10:00:00.000Z";
const seed = () => parseChanges({ version: 1, mode: "archive", periodFrom: "2026-07-04", periodTo: "2026-07-04", items: [] });
const html = (text = '<b>Что меняется:</b><br>Текст справки о налогах. <a href="https://publication.pravo.gov.ru/document/0001202607040026">Официальный текст</a>', id = 17) => `<div class="tgme_widget_message" data-post="LegisDigest/${id}"><div class="tgme_widget_message_text"><b>Обзор законодательства за неделю</b><br><br>${text}</div><a class="tgme_widget_message_date"><time datetime="2026-09-07T06:17:51+00:00"></time></a></div>`;
describe("Автообновление LegisDigest", () => {
  it("сохраняет абзацы, заголовки, источник и атрибуцию", async () => {
    const page = await parseFeed(html().replace("https://publication.pravo.gov.ru/", "http://publication.pravo.gov.ru/"));
    expect(page.posts[0]!.id).toBe("tg-17");
    expect(page.posts[0]!.url).toBe("https://t.me/LegisDigest/17");
    expect(page.posts[0]!.blocks[0]!.heading).toBe(true);
    expect(page.posts[0]!.blocks[1]!.segments.some(s => s.url?.startsWith("https://publication.pravo.gov.ru/"))).toBe(true);
  });
  it("не исполняет HTML, убирает чужие ссылки, декодирует текст один раз", async () => {
    const page = await parseFeed(html('<script>throw new Error("executed")</script>Что меняется: &lt;script&gt;текст&lt;/script&gt; &amp;lt;b&amp;gt; <a href="javascript:alert(1)">безопасный текст</a> <a href="https://rg.ru.evil.test/">чужая ссылка</a>'));
    const text = page.posts[0]!.blocks.flatMap(b => b.segments).map(s => s.text).join("");
    expect(text).toContain("<script>текст</script>"); expect(text).toContain("&lt;b&gt;"); expect(text).not.toContain("executed");
    expect(page.posts[0]!.blocks.flatMap(b => b.segments).every(s => !s.url)).toBe(true);
    expect(safeSourceUrl("https://user:secret@rg.ru/article")).toBeNull();
  });
  it("не смешивает соседние сообщения и не принимает дубли или неправильные даты", async () => {
    const page = await parseFeed(html() + html("Отдельная справка. Новые пояснения с другим содержанием для второго сообщения, которое должно храниться независимо.", 18));
    expect(page.posts).toHaveLength(2); expect(page.posts[1]!.blocks[0]!.segments[0]!.text).toContain("Отдельная справка");
    await expect(parseFeed(html() + html())).rejects.toThrow("duplicate_post");
    await expect(parseFeed(html().replace('datetime="2026-09-07T06:17:51+00:00"', ""))).rejects.toThrow("post_date_missing");
  });
  it("повтор идемпотентен, правка обновляется, поиск работает по пояснениям", async () => {
    const initial = await synchronize(seed(), now, async () => html());
    const repeated = await synchronize(initial, now, async () => html());
    expect(repeated.items).toEqual(initial.items);
    const edited = await synchronize(repeated, now, async () => html("Исправленное пояснение о налоговых льготах. Текст сохранён из опубликованного сообщения без новой генерации."));
    expect(edited.items).toHaveLength(1);
    expect(selectChanges(edited.items, new URLSearchParams({ q: "налоговых льготах" }))).toHaveLength(1);
    expect(edited.lastPostAt).toBe("2026-09-07T06:17:51.000Z");
    expect(edited.lastSuccessAt).toBe(now);
  });
  it.each(["<html>Temporarily unavailable</html>", "", html().replace("LegisDigest/17", "OtherChannel/17")])("не теряет архив при заглушке или чужом канале", async body => {
    const initial = await synchronize(seed(), now, async () => html());
    const failed = await synchronize(initial, "2026-09-22T11:00:00.000Z", async () => body);
    expect(failed.syncStatus).toBe("unavailable"); expect(failed.items).toEqual(initial.items);
    expect(failed.lastSuccessAt).toBe(now); expect(failed.checkedAt).toBe("2026-09-22T11:00:00.000Z");
  });
  it("сохраняет старые записи вне окна и отказывает при обрыве второй страницы", async () => {
    const initial = await synchronize(seed(), now, async () => html());
    const newer = await synchronize(initial, now, async () => html(undefined, 18));
    expect(newer.items).toHaveLength(2);
    let calls = 0;
    const failed = await synchronize(newer, now, async () => {
      calls++; if (calls > 1) throw new Error("network");
      return html(undefined, 19) + '<a class="tme_messages_more" data-before="19"></a>';
    });
    expect(failed.syncStatus).toBe("unavailable"); expect(failed.items).toEqual(newer.items);
  });
});
