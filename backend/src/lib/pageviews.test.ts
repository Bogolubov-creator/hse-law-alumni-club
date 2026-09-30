import { describe, expect, it } from "vitest";
import { normalizePagePath } from "./pageviews.js";

describe("normalizePagePath", () => {
  it("принимает канонические пути и срезает query", () => {
    expect(normalizePagePath("/dpo/ip-law?utm=1")).toBe("/dpo/ip-law");
    expect(normalizePagePath("/news/")).toBe("/news");
    expect(normalizePagePath("/")).toBe("/");
    expect(normalizePagePath("/lk/profile")).toBe("/lk/profile");
  });

  it("снимает /legacy и /v2", () => {
    expect(normalizePagePath("/legacy/dpo")).toBe("/dpo");
    expect(normalizePagePath("/v2/merch")).toBe("/merch");
  });

  it("отклоняет admin, api и мусор", () => {
    expect(normalizePagePath("/admin")).toBeNull();
    expect(normalizePagePath("/api/me")).toBeNull();
    expect(normalizePagePath("//evil")).toBeNull();
    expect(normalizePagePath("dpo")).toBeNull();
    expect(normalizePagePath(null)).toBeNull();
  });
});
