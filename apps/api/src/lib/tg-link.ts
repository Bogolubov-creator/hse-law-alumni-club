import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Код привязки Telegram → аккаунт выпускника для deep-link t.me/бот?start=<код>.
 * Telegram ограничивает payload 64 символами [A-Za-z0-9_-], поэтому вместо JWT –
 * компактный самодостаточный код: l<uuid в base64url><unixtime в base64url><hmac-подпись>.
 * Код действует 24 часа (TTL_SEC): подпись выдаётся на пару (uuid, момент выдачи),
 * поэтому подделать или «продлить» код без AUTH_SECRET нельзя. Дополнительно
 * принимаем небольшой сдвиг часов вперёд (CLOCK_SKEW_SEC) – часы устройств гуляют.
 */

const b64u = (buf: Buffer) => buf.toString("base64url");

/** Срок жизни кода привязки: 24 часа. */
export const TTL_SEC = 24 * 60 * 60;
/** Допуск на расхождение часов: код «из будущего» дальше этого порога отклоняем. */
const CLOCK_SKEW_SEC = 5 * 60;

// Длины частей фиксированные: 22 (uuid) + 6 (ts, 4 байта) + 14 (подпись, 10.5 байт) = 42,
// с префиксом «l» – 43 символа, укладываемся в лимит Telegram 64 с запасом.
const TS_LEN = 6;
const SIG_LEN = 14;

function sig(uuid: string, tsSec: number): string {
  return b64u(createHmac("sha256", env.AUTH_SECRET).update(`tglink:${uuid}:${tsSec}`).digest()).slice(0, SIG_LEN);
}

function encodeTs(tsSec: number): string {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(tsSec);
  return b64u(buf); // 4 байта → 6 символов base64url
}

function decodeTs(part: string): number | null {
  const buf = Buffer.from(part, "base64url");
  return buf.length === 4 ? buf.readUInt32BE(0) : null;
}

export function makeTgLinkCode(alumniId: string, nowSec: number = Math.floor(Date.now() / 1000)): string {
  const idPart = b64u(Buffer.from(alumniId.replace(/-/g, ""), "hex")); // uuid → 22 символа
  // Без разделителей: payload deep-link допускает только [A-Za-z0-9_-],
  // а длины частей фиксированные (22 + 6 + 14).
  return `l${idPart}${encodeTs(nowSec)}${sig(alumniId, nowSec)}`;
}

/** null, если код не наш, подпись не сходится или срок вышел. Иначе – alumni_id. */
export function verifyTgLinkCode(code: string, nowSec: number = Math.floor(Date.now() / 1000)): string | null {
  const m = new RegExp(`^l([A-Za-z0-9_-]{22})([A-Za-z0-9_-]{${TS_LEN}})([A-Za-z0-9_-]{${SIG_LEN}})$`).exec(code);
  if (!m) return null;
  const hex = Buffer.from(m[1]!, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const tsSec = decodeTs(m[2]!);
  if (tsSec === null) return null;
  // Сначала срок: просроченный и «из будущего» дальше допуска часов – отказ.
  if (nowSec - tsSec > TTL_SEC || tsSec - nowSec > CLOCK_SKEW_SEC) return null;
  // Сравнение подписи в постоянном времени – без timing-оракула на подбор подписи.
  const expected = Buffer.from(sig(uuid, tsSec));
  const got = Buffer.from(m[3]!);
  return expected.length === got.length && timingSafeEqual(expected, got) ? uuid : null;
}
