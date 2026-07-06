import { readItems, updateItem } from "@directus/sdk";
import { directus } from "./directus.js";
import { env } from "../env.js";
import { verifyTgLinkCode } from "./tg-link.js";
import {
  parseCommand,
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
      // Deep-link привязки из ЛК: /start l-<код> → пишем telegram_id выпускнику.
      const linkId = arg ? verifyTgLinkCode(arg) : null;
      if (linkId) {
        const owner = (await di.request((readItems as any)("alumni", { filter: { id: { _eq: linkId } }, limit: 1, fields: ["id", "fio", "telegram_id"] }))) as any[];
        if (owner[0]) {
          // Один Telegram — один аккаунт: снимаем этот tgId с прочих записей.
          const others = (await di.request((readItems as any)("alumni", { filter: { telegram_id: { _eq: tgId }, id: { _neq: linkId } }, limit: -1, fields: ["id"] }))) as any[];
          for (const o of others) await di.request((updateItem as any)("alumni", o.id, { telegram_id: null }));
          await di.request((updateItem as any)("alumni", linkId, { telegram_id: tgId }));
          return `✅ Telegram привязан к аккаунту <b>${owner[0].fio ?? "выпускника"}</b>.\n\nТеперь /points покажет ваши баллы, а /calendar отметит события, куда вы записаны.`;
        }
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
      return null;
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
  const msg = update.message;
  if (!msg?.text || !msg.from?.id) return;
  const { cmd, arg } = parseCommand(msg.text);
  if (!cmd) return;
  const reply = await buildBotReply(cmd, arg, String(msg.from.id));
  if (reply) await tgSendMessage(msg.chat.id, reply, token);
}

/** Регистрация меню команд в Telegram (идемпотентно при старте API). */
export async function registerBotCommands(token: string): Promise<void> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        commands: [
          { command: "start", description: "Приветствие и ссылки клуба" },
          { command: "points", description: "Мои баллы и уровень" },
          { command: "calendar", description: "Ближайшие события" },
          { command: "help", description: "Список команд" },
        ],
      }),
    });
    if (!r.ok) console.warn("[telegram-bot] setMyCommands:", await r.text().catch(() => ""));
  } catch (e) {
    console.warn("[telegram-bot] setMyCommands failed:", (e as Error).message);
  }
}