import { load } from "cheerio";
import { randomUUID } from "node:crypto";
import { NEWS_SOURCES, canonicalNewsUrl, type NewsSourceId } from "@club/shared";
import { checkoutPool, digest } from "./checkout-store.js";
export type NewsCandidate = { source_url: string; title: string; published_at: string | null };
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\u2014/g, "–").trim();
export function parseNewsSource(html: string, source: NewsSourceId): NewsCandidate[] {
  const $ = load(html);
  $("script,style").remove();
  const items: NewsCandidate[] = [];
  if (source === "telegram") {
    $(".tgme_widget_message[data-post]").each((_, el) => {
      const node = $(el), body = node.find(".tgme_widget_message_text");
      const copy = body.clone(); copy.find("br").replaceWith("\n");
      const title = clean(copy.text().split("\n").find(line => clean(line).length >= 8) || body.text()).slice(0, 180);
      const own = canonicalNewsUrl(`https://t.me/${node.attr("data-post")}`);
      // Ссылка на ту же новость ВШЭ объединяет репост и официальный материал.
      const linked = body.find("a[href]").toArray().map(a => canonicalNewsUrl($(a).attr("href") || "")).find(u => u?.startsWith("https://pravo.hse.ru/"));
      const date = node.find("time[datetime]").attr("datetime");
      if (own && title.length >= 8) items.push({ source_url: linked || own, title, published_at: date && Number.isFinite(Date.parse(date)) ? new Date(date).toISOString() : null });
    });
  } else {
    $(".plate_news__title a[href]").each((_, el) => {
      const source_url = canonicalNewsUrl($(el).attr("href") || ""), title = clean($(el).text());
      // Год не угадываем по короткой дате: оригинальная дата загружается отдельно.
      if (source_url && title) items.push({ source_url, title: title.slice(0, 240), published_at: null });
    });
  }
  return [...new Map(items.map(i => [i.source_url, i])).values()].slice(0, 60);
}
export function parseRussianDate(raw: string): string | null {
  const match = /(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+(\d{4})/.exec(raw);
  if (!match) return null;
  const month = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"].indexOf(match[2]!);
  const d = new Date(Date.UTC(Number(match[3]),month,Number(match[1]),12));
  return d.getUTCMonth() === month ? d.toISOString() : null;
}
async function getHtml(url: string): Promise<string> {
  const r = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "HSEAlumniClub/1.0 (news index)" } });
  if (!r.ok || !r.headers.get("content-type")?.includes("text/html")) throw new Error("Источник временно недоступен");
  if (Number(r.headers.get("content-length")) > 2_000_000) throw new Error("Ответ источника слишком большой");
  const reader = r.body!.getReader(); let size = 0; const parts: Uint8Array[] = [];
  try { while (true) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 2_000_000) throw new Error("Ответ источника слишком большой"); parts.push(chunk.value); } }
  finally { await reader.cancel(); }
  return Buffer.concat(parts).toString("utf8");
}
export async function refreshNewsSource(source: NewsSourceId) {
  const config = NEWS_SOURCES.find(s => s.id === source)!;
  const client = await checkoutPool().connect();
  try {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked", [`news-source:${source}`]);
    if (!lock.rows[0].locked) return { busy: true, found: 0 };
    const recent = await client.query("SELECT checked_at FROM club_news_source_runs WHERE source=$1 AND checked_at > now() - interval '1 minute'", [source]);
    if (recent.rowCount) return { busy: true, found: 0 };
    try {
      const items = parseNewsSource(await getHtml(config.url), source);
      if (!items.length) throw new Error("Публикации не найдены. Возможно, изменилась страница источника.");
      for (const item of items) {
        if (source !== "telegram") {
          try {
            const $ = load(await getHtml(item.source_url));
            const date = $('meta[property="article:published_time"]').attr("content") || $('meta[itemprop="datePublished"]').attr("content") || $('[itemprop="datePublished"]').attr("datetime");
            if (date && Number.isFinite(Date.parse(date))) item.published_at = new Date(date).toISOString();
            else {
              const raw = $(".articleMetaItem").filter((_,el)=>$(el).find(".articleMetaItem__label--date").length>0).find(".articleMetaItem__content").text();
              item.published_at = parseRussianDate(raw);
            }
          } catch { /* Дата остаётся неизвестной; материал сохраняется в очереди. */ }
        }
        await client.query(`INSERT INTO club_news_inbox (id,source_url,sources,title,published_at) VALUES ($1,$2,$3,$4,$5)
          ON CONFLICT (source_url) DO UPDATE SET sources=ARRAY(SELECT DISTINCT unnest(club_news_inbox.sources || EXCLUDED.sources)),
          published_at=COALESCE(club_news_inbox.published_at,EXCLUDED.published_at)`, [digest(item.source_url),item.source_url,[source],item.title,item.published_at]);
      }
      await client.query(`UPDATE club_news_inbox i SET state='imported',news_id=n.id FROM news n WHERE n.source_url=i.source_url AND i.state='new'`);
      await client.query(`INSERT INTO club_news_source_runs (source,found) VALUES ($1,$2) ON CONFLICT(source) DO UPDATE SET checked_at=now(),found=$2,error=NULL`,[source,items.length]);
      return { found: items.length, busy: false };
    } catch (e) {
      await client.query(`INSERT INTO club_news_source_runs (source,error) VALUES ($1,$2) ON CONFLICT(source) DO UPDATE SET checked_at=now(),error=$2`,[source,"Не удалось обновить источник. Повторите позже."]);
      throw Object.assign(new Error("Не удалось обновить источник. Сохранённые материалы доступны."), { statusCode: 502 });
    }
  } finally { try { await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [`news-source:${source}`]); } finally { client.release(); } }
}
export async function importNewsCandidate(id: string, title: string, excerpt: string) {
  const c = await checkoutPool().connect();
  try {
    await c.query("BEGIN");
    const { rows } = await c.query("SELECT * FROM club_news_inbox WHERE id=$1 FOR UPDATE", [id]);
    const item = rows[0]; if (!item) throw Object.assign(new Error("Материал не найден"), {statusCode:404});
    const existing = await c.query("SELECT id FROM news WHERE source_url=$1 LIMIT 1", [item.source_url]);
    let newsId = existing.rows[0]?.id;
    if (!newsId) {
      newsId = randomUUID();
      await c.query(`INSERT INTO news (id,slug,title,excerpt,body,source_url,published_at,status) VALUES ($1,$2,$3,$4,$4,$5,$6,'draft')`,
        [newsId,`source-${id.slice(0,24)}`,title,excerpt || null,item.source_url,item.published_at]);
    }
    await c.query("UPDATE club_news_inbox SET state='imported',news_id=$2 WHERE id=$1",[id,newsId]);
    await c.query("COMMIT"); return {ok:true,id:newsId};
  } catch(e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
}
