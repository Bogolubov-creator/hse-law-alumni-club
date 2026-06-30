import { describe, it, expect } from "vitest";
import { validateInitData, signInitData } from "./telegram";

const TOKEN = "123456:TEST-bot-token-for-unit-tests";

describe("Telegram initData validation", () => {
  it("принимает корректную подпись", () => {
    const initData = signInitData({ auth_date: "1700000000", query_id: "abc", user: '{"id":42,"first_name":"Анна"}' }, TOKEN);
    const res = validateInitData(initData, TOKEN);
    expect(res.ok).toBe(true);
    expect((res.user as any)?.id).toBe(42);
  });

  it("отклоняет подделанные данные", () => {
    const initData = signInitData({ auth_date: "1700000000", user: '{"id":42}' }, TOKEN);
    const tampered = initData.replace("id%22%3A42", "id%22%3A999");
    expect(validateInitData(tampered, TOKEN).ok).toBe(false);
  });

  it("отклоняет чужой токен", () => {
    const initData = signInitData({ auth_date: "1700000000" }, TOKEN);
    expect(validateInitData(initData, "999999:OTHER").ok).toBe(false);
  });

  it("отклоняет без hash", () => {
    expect(validateInitData("auth_date=1700000000", TOKEN).ok).toBe(false);
  });

  it("отклоняет устаревший initData при maxAgeSec (freshness)", () => {
    const old = signInitData({ auth_date: "1700000000", user: '{"id":1}' }, TOKEN); // 2023 г.
    expect(validateInitData(old, TOKEN, { maxAgeSec: 86400 }).ok).toBe(false);
  });

  it("принимает свежий initData при maxAgeSec", () => {
    const now = Math.floor(Date.now() / 1000).toString();
    const fresh = signInitData({ auth_date: now, user: '{"id":1}' }, TOKEN);
    expect(validateInitData(fresh, TOKEN, { maxAgeSec: 86400 }).ok).toBe(true);
  });
});
