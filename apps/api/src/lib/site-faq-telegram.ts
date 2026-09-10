/**
 * FAQ-бот сайта для Telegram @pravohse_alumni_bot.
 * Те же ответы, что у ClubSupportBot; каталог – из Directus programs.
 */
import { readItems } from "@directus/sdk";
import {
  BOT_FAQ,
  formatPrice,
  reply,
  type BotProgram,
  type BotReply,
  type BotReplyData,
} from "@club/shared";
import { directus } from "./directus.js";
import { env } from "../env.js";
import { logFaqEvent } from "./faq-events.js";

function mapFormat(raw: string | null | undefined): string {
  const f = String(raw || "").toLowerCase();
  if (/онлайн|online|дистанц/.test(f)) return "online";
  if (/смешан|mixed|гибрид/.test(f)) return "mixed";
  if (/очн|offline|офлайн/.test(f)) return "offline";
  return f || "offline";
}

function mapType(document: string | null | undefined, title: string): string {
  const d = `${document || ""} ${title}`.toLowerCase();
  if (/переподготов/.test(d)) return "ПП";
  if (/повышен|удостоверен|квалификац/.test(d)) return "ПК";
  return "";
}

async function loadPrograms(): Promise<BotProgram[]> {
  try {
    const rows = (await directus.request(
      (readItems as any)("programs", {
        filter: { status: { _eq: "published" } },
        limit: -1,
        fields: ["id", "slug", "title", "direction", "format", "duration", "price", "document", "dates", "description"],
      }),
    )) as Array<{
      id: string;
      slug: string;
      title: string;
      direction?: string | null;
      format?: string | null;
      duration?: string | null;
      price?: number | null;
      document?: string | null;
      dates?: { start?: string | null } | null;
      description?: string | null;
    }>;
    return rows.map((p) => ({
      id: p.id,
      title: p.title,
      url: `/dpo/${p.slug}`,
      sphere: p.direction || "Программы ДПО",
      type: mapType(p.document, p.title),
      format: mapFormat(p.format),
      formatLabel: p.format || undefined,
      price: typeof p.price === "number" ? Math.round(p.price / 100) : null,
      duration: p.duration || null,
      start: p.dates?.start ? `Старт: ${p.dates.start}` : null,
      startIso: null,
      keywords: p.description ? [p.description] : [],
    }));
  } catch {
    return [];
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatReply(out: BotReply, base: string): string {
  const link = (path: string, label = "На сайте") =>
    `<a href="${esc(base.replace(/\/$/, "") + path)}">${esc(label)}</a>`;
  switch (out.kind) {
    case "answer":
      return [esc(out.answer.text), "", `🌐 ${link(out.answer.anchor, "Подробнее")}`].join("\n");
    case "duration":
      return [esc(out.text), "", `🌐 ${link(out.anchor, "Витрина ДПО")}`].join("\n");
    case "gap":
      return [
        "Об этом на сайте не написано, а придумывать я не стану.",
        `Напишите человеку в поддержку: ${link("/support", "открыть обращение")}.`,
      ].join("\n");
    case "programs":
    case "programs-weak": {
      const intro = out.kind === "programs" ? out.intro : "Точного совпадения нет, вот близкое:";
      const lines = [esc(intro), ""];
      for (const p of out.programs.slice(0, 5)) {
        const meta = [p.formatLabel || p.format, typeof p.price === "number" ? formatPrice(p.price) : null, p.start]
          .filter(Boolean)
          .join(" · ");
        lines.push(`▸ <b>${esc(p.title)}</b>`);
        if (meta) lines.push(`  ${esc(meta)}`);
        lines.push(`  ${link(p.url, "Открыть")}`);
        lines.push("");
      }
      return lines.join("\n").trim();
    }
    case "none":
      return [
        "Такого не нашла. Задайте вопрос иначе или напишите человеку.",
        `🌐 ${link("/support", "Поддержка на сайте")}`,
        `🌐 ${link("/dpo", "Витрина ДПО")}`,
      ].join("\n");
    default: {
      const _e: never = out;
      void _e;
      return "";
    }
  }
}

/** Ответ на свободный текст посетителя в Telegram (не команда). */
export async function answerTelegramFaq(query: string): Promise<string | null> {
  const q = String(query || "").trim();
  if (!q || q.length < 2) return null;
  const programs = await loadPrograms();
  const data: BotReplyData = { programs, ...BOT_FAQ };
  const out = reply(q, data);
  if (out.kind === "gap" || out.kind === "none") {
    void logFaqEvent({
      kind: out.kind,
      gapId: out.kind === "gap" ? out.gap.id : null,
      channel: "telegram",
    });
  }
  return formatReply(out, env.PUBLIC_URL || "https://example.invalid");
}
