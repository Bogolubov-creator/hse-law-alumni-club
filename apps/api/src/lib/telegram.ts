import crypto from "node:crypto";

/**
 * Валидация Telegram Mini App initData по подписи (HMAC-SHA256).
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateInitData(initData: string, botToken: string): { ok: boolean; user?: unknown } {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const check = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (check !== hash) return { ok: false };

  let user: unknown;
  try { user = JSON.parse(params.get("user") || "null"); } catch { /* ignore */ }
  return { ok: true, user };
}

/** Хелпер для тестов/инструментов: собрать подписанный initData. */
export function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.entries(fields)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const p = new URLSearchParams(fields);
  p.set("hash", hash);
  return p.toString();
}
