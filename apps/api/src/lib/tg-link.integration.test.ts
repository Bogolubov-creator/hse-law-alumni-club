import { describe, it, expect, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { checkoutPool } from "./checkout-store.js";
import { loadAdminRevocations, saveAdminRevocation, consumeReset } from "./auth-state.js";
import { makeTgLinkCode, consumeTgLinkCode } from "./tg-link.js";
const enabled = process.env.RUN_TELEGRAM_INTEGRATION === "true";
if (enabled && new URL(process.env.CHECKOUT_DATABASE_URL!).pathname !== "/alumni_staged") throw new Error("Only alumni_staged is allowed");
const pool = enabled ? checkoutPool() : null;
const ids: string[] = [];
async function owner() {
  const id = randomUUID(); ids.push(id);
  await pool!.query("INSERT INTO alumni (id,fio,verification_status) VALUES ($1,'Тест','verified')", [id]);
  return id;
}
afterAll(async () => { if (pool) { await pool.query("DELETE FROM alumni WHERE id=ANY($1::uuid[])", [ids]); await pool.end(); } });
describe.skipIf(!enabled)("Telegram: реальные транзакции", () => {
  it("код используется ровно один раз при конкурентных запросах", async () => {
    const id = await owner(), code = await makeTgLinkCode(id);
    const results = await Promise.all([consumeTgLinkCode(code, "101"), consumeTgLinkCode(code, "102")]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await consumeTgLinkCode(code, "103")).toBeNull();
  });
  it("новая ссылка заменяет старую; истекшая ссылка отклоняется", async () => {
    const id = await owner(), old = await makeTgLinkCode(id), fresh = await makeTgLinkCode(id);
    expect(await consumeTgLinkCode(old, "201")).toBeNull();
    await pool!.query("UPDATE club_telegram_links SET expires_at=now()-interval '1 second' WHERE alumni_id=$1", [id]);
    expect(await consumeTgLinkCode(fresh, "201")).toBeNull();
  });
  it("не переносит чужую привязку и не заменяет Telegram владельца", async () => {
    const a = await owner(), b = await owner();
    expect(await consumeTgLinkCode(await makeTgLinkCode(a), "301")).not.toBeNull();
    expect(await consumeTgLinkCode(await makeTgLinkCode(b), "301")).toBeNull();
    expect(await consumeTgLinkCode(await makeTgLinkCode(a), "302")).toBeNull();
    expect((await pool!.query("SELECT telegram_id FROM alumni WHERE id=$1", [a])).rows[0].telegram_id).toBe("301");
  });
  it("выход администратора восстанавливается из БД; reset погашается атомарно", async () => {
    const id = randomUUID(), expires = Date.now() + 100000;
    await saveAdminRevocation(id, expires);
    expect(await loadAdminRevocations()).toContainEqual([id, expires]);
    expect((await Promise.all([consumeReset(id), consumeReset(id)])).filter(Boolean)).toHaveLength(1);
    await pool!.query("DELETE FROM club_auth_revocations WHERE token_key=ANY($1::text[])", [[`admin:${id}`, `reset:${id}`]]);
  });
  it("не привязывает отклонённого выпускника", async () => {
    const id = await owner(), code = await makeTgLinkCode(id);
    await pool!.query("UPDATE alumni SET verification_status='rejected' WHERE id=$1", [id]);
    expect(await consumeTgLinkCode(code, "401")).toBeNull();
  });
});
