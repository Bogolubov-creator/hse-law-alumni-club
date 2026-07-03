/**
 * Анти-брутфорс по конкретному аккаунту (в дополнение к per-IP rate-limit):
 * после MAX_FAILS неудачных попыток вход для этого email блокируется на
 * LOCK_MS независимо от IP (распределённый перебор с многих адресов).
 * Хранение в памяти процесса — при рестарте счётчики обнуляются (приемлемо:
 * rate-limit per-IP остаётся всегда).
 */
const MAX_FAILS = 10;
const LOCK_MS = 15 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;

interface Entry { fails: number; first: number; lockedUntil: number }
const attempts = new Map<string, Entry>();

// Периодическая уборка, чтобы Map не рос бесконечно.
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of attempts) {
    if (e.lockedUntil < now && now - e.first > WINDOW_MS) attempts.delete(k);
  }
}, 60_000).unref();

export function loginLocked(email: string): boolean {
  const e = attempts.get(email.toLowerCase());
  return !!e && e.lockedUntil > Date.now();
}

export function registerLoginFail(email: string): void {
  const key = email.toLowerCase();
  const now = Date.now();
  const e = attempts.get(key);
  if (!e || now - e.first > WINDOW_MS) {
    attempts.set(key, { fails: 1, first: now, lockedUntil: 0 });
    return;
  }
  e.fails++;
  if (e.fails >= MAX_FAILS) e.lockedUntil = now + LOCK_MS;
}

export function registerLoginSuccess(email: string): void {
  attempts.delete(email.toLowerCase());
}

/** IP-подсети уведомлений ЮKassa (https://yookassa.ru/developers/using-api/webhooks). */
const YOOKASSA_CIDRS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
];

function ipToInt(ip: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip.trim());
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return ((parts[0]! << 24) | (parts[1]! << 16) | (parts[2]! << 8) | parts[3]!) >>> 0;
}

/** true, если IPv4-адрес принадлежит официальным подсетям ЮKassa. */
export function isYookassaIp(ip: string): boolean {
  const addr = ipToInt(ip.replace(/^::ffff:/, "")); // IPv4-mapped IPv6
  if (addr === null) return false;
  return YOOKASSA_CIDRS.some((cidr) => {
    const [net, bitsStr] = cidr.split("/");
    const bits = Number(bitsStr);
    const netInt = ipToInt(net!);
    if (netInt === null) return false;
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (addr & mask) === (netInt & mask);
  });
}
