import { levelInfo } from "@club/shared";

export function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtEventDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
  });
}

/** Разбор «/points@pravohse_alumni_bot арг» → cmd + args. */
export function parseCommand(text: string): { cmd: string; arg: string } {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) return { cmd: "", arg: "" };
  const parts = trimmed.split(/\s+/);
  const raw = parts[0] ?? "";
  const cmd = raw.split("@")[0]?.toLowerCase() ?? "";
  const rest = parts.slice(1);
  return { cmd, arg: rest.join(" ").trim() };
}

export function formatPointsReply(
  alumni: { fio: string | null; verification_status: string; points_cached: number; personal_discount: number },
  publicUrl: string,
): string {
  if (alumni.verification_status !== "verified") {
    return [
      "⏳ <b>Профиль на проверке</b>",
      "",
      `${esc(alumni.fio ?? "Выпускник")}, учебный офис ещё подтверждает ваш статус.`,
      "После верификации здесь появятся баллы и уровень.",
      "",
      `🌐 <a href="${esc(publicUrl)}/lk">Личный кабинет</a>`,
    ].join("\n");
  }
  const info = levelInfo(alumni.points_cached ?? 0, alumni.personal_discount ?? 0);
  const lines = [
    `📊 <b>${esc(alumni.fio ?? "Выпускник")}</b>`,
    "",
    `Уровень: <b>${esc(info.level_title)}</b>`,
    `Баллы: <b>${info.points}</b>`,
    `Скидка на ДПО: <b>${info.discount}%</b>`,
  ];
  if (info.next_level) lines.push(`До «${esc(info.next_level)}»: ещё ${info.to_next} баллов`);
  lines.push("", `🌐 <a href="${esc(publicUrl)}/lk">Открыть кабинет</a>`);
  return lines.join("\n");
}

export function formatCalendarReply(
  events: { title: string; starts_at: string; location: string | null; format: string; going: number; my_rsvp: boolean; reg_url?: string | null }[],
  publicUrl: string,
): string {
  if (!events.length) {
    return [
      "📅 <b>Календарь клуба</b>",
      "",
      "Ближайших событий пока нет – загляните позже.",
      "",
      `🌐 <a href="${esc(publicUrl)}/events">Афиша на сайте</a>`,
    ].join("\n");
  }
  const lines = ["📅 <b>Ближайшие события</b>", ""];
  for (const e of events) {
    const place = e.format === "online" ? "онлайн" : (e.location ? esc(e.location) : "офлайн");
    const rsvp = e.my_rsvp ? " · вы идёте ✓" : "";
    lines.push(`▸ <b>${esc(e.title)}</b>`);
    lines.push(`  ${fmtEventDate(e.starts_at)} · ${place} · ${e.going} чел.${rsvp}`);
    if (e.reg_url) lines.push(`  📝 <a href="${esc(e.reg_url)}">Регистрация</a>`);
    lines.push("");
  }
  lines.push(`🌐 <a href="${esc(publicUrl)}/events">Вся афиша и RSVP</a>`);
  return lines.join("\n");
}

export function formatStartReply(arg: string, linked: boolean, publicUrl: string): string {
  const joinUrl = arg ? `${publicUrl}/join?ref=${encodeURIComponent(arg)}` : `${publicUrl}/join`;
  const lines = [
    "👋 <b>Клуб выпускников факультета права Вышки</b>",
    "",
    "Команды бота:",
    "/points – баллы и уровень",
    "/calendar – ближайшие события",
    "/cabinet – личный кабинет",
    "/dpo – программы обучения",
    "/support – обратиться в поддержку",
    "/help – подсказка",
    "",
    "Можно просто написать вопрос про клуб или ДПО – отвечу по сайту.",
  ];
  if (arg) {
    lines.push("", `🎓 Вы пришли по приглашению – <a href="${esc(joinUrl)}">вступить в клуб</a>`);
  } else {
    lines.push("", `🎓 <a href="${esc(joinUrl)}">Вступить в клуб</a>`);
  }
  lines.push(`🌐 <a href="${esc(publicUrl)}">Сайт клуба</a>`);
  if (!linked) {
    lines.push(
      "",
      "ℹ️ Чтобы /points показывал ваши данные, нажмите «Привязать Telegram» в личном кабинете на сайте клуба.",
    );
  }
  return lines.join("\n");
}

export function formatHelpReply(publicUrl: string): string {
  return [
    "ℹ️ <b>Команды бота</b>",
    "",
    "/start – приветствие и ссылки",
    "/points – баллы, уровень, скидка",
    "/calendar – афиша ближайших событий",
    "/cabinet – личный кабинет",
    "/dpo – программы обучения",
    "/support – обратиться в поддержку",
    "/help – эта подсказка",
    "",
    "Или напишите вопрос текстом – отвечу по сайту клуба и программам ДПО",
    "(вступление, подкасты, мерч, скидка выпускника).",
    "",
    `🌐 Сайт: <a href="${esc(publicUrl)}">${esc(publicUrl)}</a>`,
    `💬 Поддержка: <a href="${esc(publicUrl)}/support">${esc(publicUrl)}/support</a>`,
  ].join("\n");
}

export function formatUnlinkedPointsReply(publicUrl: string): string {
  return [
    "🔒 <b>Telegram не привязан</b>",
    "",
    `Зайдите в <a href="${esc(publicUrl)}/lk">личный кабинет</a> на сайте и нажмите «Привязать Telegram» – после этого /points покажет ваши баллы, уровень и скидку.`,
  ].join("\n");
}

/** Меню Telegram и быстрые переходы используют один список команд. */
export const BOT_COMMANDS = [
  { command: "start", description: "Приветствие и ссылки клуба" },
  { command: "points", description: "Мои баллы и уровень" },
  { command: "calendar", description: "Ближайшие события" },
  { command: "cabinet", description: "Открыть личный кабинет" },
  { command: "dpo", description: "Программы обучения" },
  { command: "support", description: "Обратиться в поддержку" },
  { command: "help", description: "Список команд" },
];

export function formatLinkedReply(name: string): string {
  return `✅ Telegram привязан к аккаунту <b>${esc(name)}</b>.\n\nТеперь /points покажет ваши баллы, а /calendar отметит события, куда вы записаны.`;
}

export function formatNavigationReply(command: string, publicUrl: string): string | null {
  const routes: Record<string, [string, string]> = {
    "/cabinet": ["/lk", "Личный кабинет"],
    "/dpo": ["/dpo", "Программы ДПО"],
    "/support": ["/support", "Обратиться в поддержку"],
  };
  const target = routes[command];
  return target ? `<a href="${esc(publicUrl.replace(/\/$/, "") + target[0])}">${target[1]}</a>` : null;
}
