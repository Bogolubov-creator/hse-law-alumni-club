import { recordReaction, type ReactionUpdate } from "./social-progress.js";
import { readItems } from "@directus/sdk";
import { directus } from "./directus.js";
import { env } from "../env.js";
import { consumeTgLinkCode } from "./tg-link.js";
import { answerTelegramFaq } from "./site-faq-telegram.js";
import {
  parseCommand,
  BOT_COMMANDS,
  formatLinkedReply,
  formatNavigationReply,
  formatPointsReply,
  formatCalendarReply,
  formatStartReply,
  formatHelpReply,
  formatUnlinkedPointsReply,
} from "./telegram-bot-text.js";

export { parseCommand, formatPointsReply, formatCalendarReply, formatStartReply, formatHelpReply } from "./telegram-bot-text.js";

const di = directus;

export interface TgMessage {
  message_id: number;
  text?: string;
  chat: { id: number; type: string };
  from?: { id: number; first_name?: string };
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  message_reaction?: ReactionUpdate;
}

async function findAlumniByTelegram(tgId: string) {
  const rows = (await di.request((readItems as any)("alumni", {
    filter: { telegram_id: { _eq: tgId } },
    limit: 1,
    fields: ["id", "fio", "verification_status", "points_cached", "personal_discount"],
  }))) as { id: string; fio: string | null; verification_status: string; points_cached: number; personal_discount: number }[];
  return rows[0] ?? null;
}

async function upcomingEvents(tgId: string | null) {
  const now = new Date().toISOString();
  const rows = (await di.request((readItems as any)("events", {
    filter: { _and: [{ status: { _eq: "published" } }, { starts_at: { _gte: now } }] },
    sort: ["starts_at"], limit: 5,
    fields: ["id", "title", "starts_at", "location", "format", "reg_url"],
  }))) as { id: string; title: string; starts_at: string; location: string | null; format: string }[];

  const rsvps = rows.length
    ? (await di.request((readItems as any)("event_rsvps", {
        filter: { event_id: { _in: rows.map((e) => e.id) } },
        limit: -1, fields: ["event_id", "alumni_id"],
      }))) as { event_id: string; alumni_id: string }[]
    : [];

  let myId: string | null = null;
  if (tgId) {
    const a = await findAlumniByTelegram(tgId);
    myId = a?.id ?? null;
  }

  return rows.map((e) => {
    const mine = myId ? rsvps.some((r) => r.event_id === e.id && r.alumni_id === myId) : false;
    const going = rsvps.filter((r) => r.event_id === e.id).length;
    return { title: e.title, starts_at: e.starts_at, location: e.location, format: e.format, reg_url: (e as any).reg_url ?? null, going, my_rsvp: mine };
  });
}

/** Текст ответа на команду. */
export async function buildBotReply(cmd: string, arg: string, tgId: string): Promise<string | null> {
  const url = env.PUBLIC_URL;
  switch (cmd) {
    case "/start": {
      if (arg.startsWith("l")) {
        const owner = await consumeTgLinkCode(arg, tgId);
        if (owner) return formatLinkedReply(owner.fio);
        return "Ссылка привязки истекла, уже использована или аккаунт уже связан с Telegram. Откройте кабинет и получите новую ссылку. Для смены связанного аккаунта обратитесь в поддержку.";
      }
      const linked = !!(await findAlumniByTelegram(tgId));
      return formatStartReply(arg, linked, url);
    }
    case "/help":
      return formatHelpReply(url);
    case "/points": {
      const alumni = await findAlumniByTelegram(tgId);
      if (!alumni) return formatUnlinkedPointsReply(url);
      return formatPointsReply(alumni, url);
    }
    case "/calendar":
      return formatCalendarReply(await upcomingEvents(tgId), url);
    default:
      return formatNavigationReply(cmd, url);
  }
}

export async function tgSendMessage(chatId: number, text: string, token: string): Promise<boolean> {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
  });
  if (!r.ok) console.error("[telegram-bot] sendMessage failed:", r.status, await r.text().catch(() => ""));
  return r.ok;
}

/** Обработка входящего update от Telegram webhook. */
export async function handleTelegramUpdate(update: TgUpdate, token: string): Promise<void> {
  if (update.message_reaction) { await recordReaction(update.message_reaction, update.update_id); return; }
  const msg = update.message;
  if (!msg?.text || !msg.from?.id) return;
  // Личные сведения и привязка доступны только в диалоге с ботом.
  // Групповые апдейты не вызывают ни чтения профиля, ни записи в CMS.
  if (msg.chat.type !== "private") return;
  const addressed = /^\/[^\s@]+@([^\s]+)/.exec(msg.text.trim());
  if (addressed && addressed[1]!.toLowerCase() !== env.TELEGRAM_BOT_USERNAME.toLowerCase()) return;
  const { cmd, arg } = parseCommand(msg.text);
  if (!cmd) {
    // Свободный текст – тот же FAQ, что у вороны на сайте.
    const faq = await answerTelegramFaq(msg.text);
    if (faq) await tgSendMessage(msg.chat.id, faq, token);
    return;
  }
  const reply = await buildBotReply(cmd, arg, String(msg.from.id));
  await tgSendMessage(msg.chat.id, reply ?? "Не знаю такой команды. Нажмите /help или напишите вопрос про клуб и ДПО.", token);
}

/** Регистрация меню команд в Telegram (идемпотентно при старте API). */
export async function registerBotCommands(token: string): Promise<void> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: BOT_COMMANDS,
      }),
    });
    if (!r.ok) throw new Error(`setMyCommands: HTTP ${r.status}`);
    if (env.APP_ENV === "production" && env.PUBLIC_URL.startsWith("https://")) {
      const menu = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
        body: JSON.stringify({ menu_button: { type: "web_app", text: "Клуб", web_app: { url: `${env.PUBLIC_URL.replace(/\/$/, "")}/tg` } } }),
      });
      if (!menu.ok) throw new Error(`setChatMenuButton: HTTP ${menu.status}`);
    }
  } catch (e) {
    console.warn("[telegram-bot] Не удалось настроить меню команд/мини-приложения");
  }
}