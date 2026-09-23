import { env } from "../env.js";
import { checkoutPool } from "./checkout-store.js";

/** Одноинстансный сервер: при старте восстанавливаем погашенные сессии из БД. */
export async function loadAdminRevocations(): Promise<[string, number][]> {
  if (!env.CHECKOUT_DATABASE_URL) return [];
  await checkoutPool().query("DELETE FROM club_auth_revocations WHERE expires_at <= now()");
  const { rows } = await checkoutPool().query("SELECT token_key,expires_at FROM club_auth_revocations WHERE token_key LIKE 'admin:%' AND expires_at > now()");
  return rows.map(r => [r.token_key.slice(6), new Date(r.expires_at).getTime()]);
}
export async function saveAdminRevocation(jti: string, expires: number): Promise<void> {
  if (!env.CHECKOUT_DATABASE_URL) return;
  await checkoutPool().query(`INSERT INTO club_auth_revocations(token_key,expires_at) VALUES($1,$2)
    ON CONFLICT(token_key) DO UPDATE SET expires_at=EXCLUDED.expires_at`, [`admin:${jti}`, new Date(expires)]);
}
/** Погашение до смены пароля защищает и от гонки, и от повторного использования после рестарта. */
export async function consumeReset(jti: string): Promise<boolean> {
  if (!env.CHECKOUT_DATABASE_URL) return true;
  const result = await checkoutPool().query(`INSERT INTO club_auth_revocations(token_key,expires_at)
    VALUES($1,now()+interval '24 hours') ON CONFLICT(token_key) DO NOTHING`, [`reset:${jti}`]);
  return !!result.rowCount;
}
