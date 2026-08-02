import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../env.js";

/**
 * Код привязки Telegram → аккаунт выпускника для deep-link t.me/бот?start=<код>.
 * Telegram ограничивает payload 64 символами [A-Za-z0-9_-], поэтому вместо JWT –
 * компактный самодостаточный код: l-<uuid в base64url><hmac-подпись>. Бессрочный
 * (привязка и так подтверждается нажатием Start самим владельцем Telegram).
 */

const b64u = (buf: Buffer) => buf.toString("base64url");

function sig(uuid: string): string {
  return b64u(createHmac("sha256", env.AUTH_SECRET).update(`tglink:${uuid}`).digest().subarray(0, 12));
}

export function makeTgLinkCode(alumniId: string): string {
  const idPart = b64u(Buffer.from(alumniId.replace(/-/g, ""), "hex")); // uuid → 22 символа
  // Без разделителя: payload deep-link допускает только [A-Za-z0-9_-],
  // а длины частей фиксированные (22 + 16).
  return `l${idPart}${sig(alumniId)}`;
}

/** null, если код не наш или подпись не сходится. Иначе – alumni_id. */
export function verifyTgLinkCode(code: string): string | null {
  const m = /^l([A-Za-z0-9_-]{22})([A-Za-z0-9_-]{16})$/.exec(code);
  if (!m) return null;
  const hex = Buffer.from(m[1]!, "base64url").toString("hex");
  if (hex.length !== 32) return null;
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  // Сравнение подписи в постоянном времени – без timing-оракула на подбор подписи.
  const expected = Buffer.from(sig(uuid));
  const got = Buffer.from(m[2]!);
  return expected.length === got.length && timingSafeEqual(expected, got) ? uuid : null;
}
