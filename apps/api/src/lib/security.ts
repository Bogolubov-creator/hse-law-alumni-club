/**
 * Анти-брутфорс входа (в дополнение к per-IP rate-limit @fastify/rate-limit).
 * Два независимых счётчика неудач:
 *  • по аккаунту (email) — гасит перебор пароля к ОДНОМУ аккаунту (в т.ч. с многих IP);
 *  • по IP — гасит password spraying (один IP по МНОГИМ аккаунтам: per-email лок не
 *    срабатывает, т.к. на каждый email лишь 1 неудача, а rate-limit сбрасывает окно).
 * Хранение в памяти процесса — при рестарте счётчики обнуляются (приемлемо: rate-limit
 * per-IP остаётся всегда). Одноинстансный деплой (см. deploy-runbook); при масштабировании
 * нужен общий стор (Redis).
 */
interface Entry { fails: number; first: number; lockedUntil: number }

function isLocked(map: Map<string, Entry>, key: string): boolean {
  const e = map.get(key);
  return !!e && e.lockedUntil > Date.now();
}
function bumpFail(map: Map<string, Entry>, key: string, maxFails: number, lockMs: number, windowMs: number): void {
  const now = Date.now();
  const e = map.get(key);
  if (!e || now - e.first > windowMs) { map.set(key, { fails: 1, first: now, lockedUntil: 0 }); return; }
  e.fails++;
  if (e.fails >= maxFails) e.lockedUntil = now + lockMs;
}

// По аккаунту: 10 неудач за 15 мин → блок на 15 мин.
const EMAIL_MAX = 10, EMAIL_LOCK_MS = 15 * 60 * 1000, EMAIL_WINDOW_MS = 15 * 60 * 1000;
const emailAttempts = new Map<string, Entry>();
// По IP: 30 неудач за 15 мин → блок на 30 мин (запас под общий NAT легитимных юзеров).
const IP_MAX = 30, IP_LOCK_MS = 30 * 60 * 1000, IP_WINDOW_MS = 15 * 60 * 1000;
const ipAttempts = new Map<string, Entry>();

// Периодическая уборка, чтобы Map'ы не росли бесконечно.
setInterval(() => {
  const now = Date.now();
  for (const map of [emailAttempts, ipAttempts]) {
    for (const [k, e] of map) {
      if (e.lockedUntil < now && now - e.first > IP_WINDOW_MS) map.delete(k);
    }
  }
}, 60_000).unref();

export function loginLocked(email: string): boolean {
  return isLocked(emailAttempts, email.toLowerCase());
}
export function registerLoginFail(email: string): void {
  bumpFail(emailAttempts, email.toLowerCase(), EMAIL_MAX, EMAIL_LOCK_MS, EMAIL_WINDOW_MS);
}
export function registerLoginSuccess(email: string): void {
  emailAttempts.delete(email.toLowerCase());
}

/** Заблокирован ли IP по превышению суммарных неудач входа (password spraying). */
export function ipLoginLocked(ip: string): boolean {
  return isLocked(ipAttempts, ip);
}
export function registerIpFail(ip: string): void {
  bumpFail(ipAttempts, ip, IP_MAX, IP_LOCK_MS, IP_WINDOW_MS);
}
export function registerIpSuccess(ip: string): void {
  ipAttempts.delete(ip);
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

/**
 * Использованные токены сброса пароля (одноразовость, слой 1). Ссылка живёт
 * 30 минут, поэтому и запись держим 30 минут — дольше она бессмысленна.
 * Слой 2 (token_version в самой ссылке) переживает рестарт процесса, см. auth-роут.
 */
const usedResetJti = new Map<string, number>();
const RESET_TTL_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of usedResetJti) if (exp < now) usedResetJti.delete(jti);
}, 60_000).unref();

export function resetTokenUsed(jti: string): boolean {
  const exp = usedResetJti.get(jti);
  return !!exp && exp > Date.now();
}
export function markResetTokenUsed(jti: string): void {
  usedResetJti.set(jti, Date.now() + RESET_TTL_MS);
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
