import { randomBytes } from "node:crypto";
import { checkoutPool, digest } from "./checkout-store.js";

/** Одноразовый код на 10 минут. В БД хранится только хеш; старые HMAC-ссылки недействительны. */
export async function makeTgLinkCode(alumniId: string): Promise<string> {
  const code = `l${randomBytes(24).toString("base64url")}`;
  await checkoutPool().query("DELETE FROM club_telegram_links WHERE expires_at <= now()");
  await checkoutPool().query(`INSERT INTO club_telegram_links (alumni_id, token_hash, expires_at)
    VALUES ($1, $2, now() + interval '10 minutes')
    ON CONFLICT (alumni_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at`, [alumniId, digest(code)]);
  return code;
}

/** Привязка и погашение кода в одной транзакции. Уже привязанные аккаунты не переносятся. */
export async function consumeTgLinkCode(code: string, tgId: string): Promise<{ fio: string } | null> {
  if (!/^l[A-Za-z0-9_-]{32}$/.test(code) || !/^[1-9][0-9]{0,15}$/.test(tgId) || !Number.isSafeInteger(Number(tgId))) return null;
  const c = await checkoutPool().connect();
  try {
    await c.query("BEGIN");
    // Редкая операция: общий замок исключает гонку двух кодов для одного Telegram.
    await c.query("SELECT pg_advisory_xact_lock(hashtextextended('telegram-link', 0))");
    const { rows } = await c.query(`SELECT a.id, a.fio, a.telegram_id FROM club_telegram_links l
      JOIN alumni a ON a.id=l.alumni_id WHERE l.token_hash=$1 AND l.expires_at > now()
      AND a.verification_status='verified' FOR UPDATE OF l, a`, [digest(code)]);
    const owner = rows[0];
    const occupied = owner && (await c.query("SELECT id FROM alumni WHERE telegram_id=$1 AND id<>$2", [tgId, owner.id])).rowCount;
    if (!owner || occupied || (owner.telegram_id && owner.telegram_id !== tgId)) {
      await c.query("ROLLBACK");
      return null;
    }
    await c.query("UPDATE alumni SET telegram_id=$1 WHERE id=$2", [tgId, owner.id]);
    await c.query("DELETE FROM club_telegram_links WHERE alumni_id=$1", [owner.id]);
    await c.query("COMMIT");
    return { fio: owner.fio ?? "выпускника" };
  } catch (e) { await c.query("ROLLBACK"); throw e; }
  finally { c.release(); }
}
