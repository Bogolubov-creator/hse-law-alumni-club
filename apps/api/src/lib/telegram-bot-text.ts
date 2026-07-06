import { computeLevel, computeMemberDiscount, LEVELS } from "@club/shared";

function levelInfo(points: number, personalDiscount = 0) {
  const level = computeLevel(points);
  const idx = LEVELS.findIndex((l) => l.key === level.key);
  const next = LEVELS[idx + 1] ?? null;
  return {
    points,
    level_title: level.title,
    discount: computeMemberDiscount(points, personalDiscount),
    next_level: next?.title ?? null,
    to_next: next ? Math.max(0, next.min_points - points) : 0,
  };
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
      "Ближайших событий пока нет — загляните позже.",
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
    "👋 <b>Клуб выпускников факультета права НИУ ВШЭ</b>",
    "",
    "Команды бота:",
    "/points — баллы и уровень",
    "/calendar — ближайшие события",
    "/help — подсказка",
  ];
  if (arg) {
    lines.push("", `🎓 Вы пришли по приглашению — <a href="${esc(joinUrl)}">вступить в клуб</a>`);
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
    "/start — приветствие и ссылки",
    "/points — баллы, уровень, скидка",
    "/calendar — афиша ближайших событий",
    "/help — эта подсказка",
    "",
    `🌐 Сайт: <a href="${esc(publicUrl)}">${esc(publicUrl)}</a>`,
  ].join("\n");
}

export function formatUnlinkedPointsReply(publicUrl: string): string {
  return [
    "🔒 <b>Telegram не привязан</b>",
    "",
    "Чтобы видеть баллы, попросите учебный офис привязать ваш Telegram-ID в админ-панели.",
    "",
    `🌐 Или зайдите в <a href="${esc(publicUrl)}/lk">личный кабинет</a> на сайте.`,
  ].join("\n");
}