import { Window, type Node as HtmlNode, type Element as HtmlElement } from "happy-dom";
import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { CHANNEL, parseChanges, safeSourceUrl, validInstant, type ChangeBlock, type ChangeSegment, type ChangesSnapshot, type LawChange } from "../src/lib/changes-schema.js";

const FEED = `https://t.me/s/${CHANNEL}`;
const PUBLISHED = "https://bogolubov-creator.github.io/club-pravo-hse-mirror/data/changes.json";
const MAX_BYTES = 2_000_000;
export interface FeedPage { posts: LawChange[]; nextBefore: number | null; visibleIds: number[] }

/** Парсим инертный документ. Никакие скрипты, стили и iframe источника не запускаются. */
export async function parseFeed(html: string): Promise<FeedPage> {
  if (Buffer.byteLength(html) > MAX_BYTES) throw new Error("source_too_large");
  const window = new Window({ settings: { disableJavaScriptEvaluation: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true, disableIframePageLoading: true } });
  try {
    const doc = new window.DOMParser().parseFromString(html, "text/html");
    const messages = [...doc.querySelectorAll(".tgme_widget_message[data-post]")];
    if (!messages.length) throw new Error("source_markup_missing");
    const posts: LawChange[] = [];
    const visibleIds: number[] = [];
    for (const message of messages) {
      const match = new RegExp(`^${CHANNEL}/([1-9]\\d{0,11})$`).exec(message.getAttribute("data-post") || "");
      if (!match) throw new Error("unexpected_channel");
      const postId = Number(match[1]);
      if (visibleIds.includes(postId)) throw new Error("duplicate_post");
      visibleIds.push(postId);
      const content = message.querySelector(".tgme_widget_message_text");
      if (!content) continue;
      const blocks: ChangeBlock[] = [];
      let segments: ChangeSegment[] = [];
      let allBold = true;
      const flush = () => {
        if (segments.some(s => s.text.trim())) {
          const text = segments.map(s => s.text).join("");
          blocks.push({ heading: (allBold && text.length < 180) || (text.trim().endsWith(":") && text.length < 80), segments });
        }
        segments = []; allBold = true;
      };
      const walk = (node: HtmlNode, bold = false, href?: string) => {
        if (node.nodeType === 3) {
          const text = (node.textContent || "").replace(/\u00a0/g, " ").replace(/—/g, "–");
          if (text) segments.push(href ? { text, url: href } : { text });
          if (text.trim() && !bold) allBold = false;
          return;
        }
        if (node.nodeType !== 1) return;
        const el = node as HtmlElement;
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "SVG"].includes(el.tagName)) return;
        if (el.tagName === "BR") { flush(); return; }
        const link = el.tagName === "A" ? safeSourceUrl((el.getAttribute("href") || "").replace(/^http:\/\/publication\.pravo\.gov\.ru\//, "https://publication.pravo.gov.ru/")) || undefined : href;
        if (["P", "DIV", "LI"].includes(el.tagName)) flush();
        for (const child of el.childNodes) walk(child, bold || ["B", "STRONG"].includes(el.tagName), link);
        if (["P", "DIV", "LI"].includes(el.tagName)) flush();
      };
      for (const child of content.childNodes) walk(child);
      flush();
      const plain = blocks.map(b => b.segments.map(s => s.text).join("")).join("\n");
      if (!plain.trim() || /^(Channel created|Проверка связи)(?:\n|$)/i.test(plain.trim())) continue;
      if (plain.length < 80) continue;
      const date = message.querySelector(".tgme_widget_message_date time")?.getAttribute("datetime");
      if (!validInstant(date)) throw new Error("post_date_missing");
      const sourcePublishedAt = new Date(date).toISOString();
      const published = sourcePublishedAt.slice(0, 10);
      const firstLine = blocks[0]!.segments.map(s => s.text).join("").trim();
      const title = firstLine.length <= 350 ? firstLine : `Материал LegisDigest от ${published}`;
      const body = firstLine.length <= 350 && blocks.length > 1 ? blocks.slice(1) : blocks;
      const firstParagraph = body.find(b => !b.heading)?.segments.map(s => s.text).join("").trim() || firstLine;
      const summary = firstParagraph.length > 280 ? firstParagraph.slice(0, 277).replace(/\s+\S*$/, "") + "…" : firstParagraph;
      const kind = /аудиовыпуск/i.test(title) ? "Аудиовыпуск" : /обзор законодательства|готовится|вступило/i.test(title) ? "Обзор недели" : "Краткая справка";
      posts.push({ id: `tg-${postId}`, title, kind, number: "", date: published, published,
        url: `https://t.me/${CHANNEL}/${postId}`, topic: kind, effectiveDate: null, entryType: "digest", summary, blocks: body, sourcePublishedAt });
    }
    if (!visibleIds.length) throw new Error("source_empty");
    const next = doc.querySelector("a.tme_messages_more[data-before]")?.getAttribute("data-before");
    if (next && !/^[1-9]\d{0,11}$/.test(next)) throw new Error("invalid_pagination");
    return { posts, visibleIds, nextBefore: next ? Number(next) : null };
  } finally { await window.happyDOM.close(); }
}

export async function fetchText(url: string): Promise<string> {
  if (url !== PUBLISHED && !/^https:\/\/t\.me\/s\/LegisDigest(?:\?before=[1-9]\d{0,11})?$/.test(url)) throw new Error("unexpected_fetch_url");
  const response = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body) throw new Error(`source_http_${response.status}`);
  const reader = response.body.getReader(); let total = 0; const chunks: Uint8Array[] = [];
  while (true) {
    const chunk = await reader.read(); if (chunk.done) break;
    total += chunk.value.length;
    if (total > MAX_BYTES) { await reader.cancel(); throw new Error("source_too_large"); }
    chunks.push(chunk.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function synchronize(previous: ChangesSnapshot, now: string, get: (url: string) => Promise<string> = fetchText): Promise<ChangesSnapshot> {
  if (!validInstant(now)) throw new Error("invalid_clock");
  try {
    const found = new Map<string, LawChange>();
    let url = FEED;
    for (let page = 0; page < 10; page++) {
      const result = await parseFeed(await get(url));
      for (const post of result.posts) {
        if (found.has(post.id)) throw new Error("duplicate_page");
        if (Date.parse(post.sourcePublishedAt!) > Date.parse(now) + 300000) throw new Error("future_post");
        found.set(post.id, post);
      }
      if (!result.nextBefore) break;
      if (result.nextBefore > Math.min(...result.visibleIds)) throw new Error("pagination_not_older");
      const next = `${FEED}?before=${result.nextBefore}`;
      if (next === url) throw new Error("pagination_loop");
      url = next;
    }
    if (!found.size) throw new Error("no_materials");
    const latest = [...found.values()].map(p => p.sourcePublishedAt!).sort().at(-1)!;
    if (previous.lastPostAt && Date.parse(latest) < Date.parse(previous.lastPostAt)) throw new Error("source_went_backwards");
    const items = new Map(previous.items.map(item => [item.id, item]));
    // Отсутствие поста в последней странице не означает его удаления из архива.
    for (const [id, item] of found) items.set(id, item);
    const dates = [...items.values()].map(item => item.published).sort();
    return parseChanges({ version: 2, mode: "channel", periodFrom: dates[0], periodTo: dates.at(-1),
      checkedAt: now, lastSuccessAt: now, lastPostAt: latest, syncStatus: "ok", items: [...items.values()] });
  } catch {
    // Не выводим исходный ответ или текст исключения: публичный JSON содержит только состояние.
    return parseChanges({ ...previous, checkedAt: now, syncStatus: "unavailable" });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const output = resolve(args[args.indexOf("--output") + 1] || "");
  if (!args.includes("--output")) throw new Error("output_required");
  let previous = parseChanges(JSON.parse(await readFile(output, "utf8")));
  if (args.includes("--previous-published")) {
    // Если прежнюю выкладку получить нельзя, прекращаем сборку, а не теряем накопленный архив.
    previous = parseChanges(JSON.parse(await fetchText(PUBLISHED)));
  }
  const result = await synchronize(previous, new Date().toISOString());
  const temporary = `${output}.tmp`;
  await writeFile(temporary, JSON.stringify(result, null, 2) + "\n", "utf8");
  await rename(temporary, output);
  console.log(JSON.stringify({ status: result.syncStatus, materials: result.items.filter(i => i.entryType === "digest").length,
    lastPostAt: result.lastPostAt, lastSuccessAt: result.lastSuccessAt }));
  if (result.syncStatus !== "ok") console.log("::warning::LegisDigest недоступен: сохранены предыдущие материалы и дата успешной проверки.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error("Синхронизация прервана; опубликованная база остаётся без изменений."); process.exitCode = 1; });
}
