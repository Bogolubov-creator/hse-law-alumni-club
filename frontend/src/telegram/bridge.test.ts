import { describe, expect, it } from "vitest";
import { miniStartRoute } from "./bridge.js";

describe("miniStartRoute", () => {
  it.each([ ["club", "/"], ["dpo", "/dpo"], ["events", "/events"], ["lk", "/lk"], ["p_business-mediation", "/dpo/business-mediation"] ])("opens %s", (value, route) => {
    expect(miniStartRoute(value)).toBe(route);
  });
  it.each([null, undefined, "", "admin", "__proto__", "constructor", "https://example.org", "//example.org", "p_../admin", "p_test?admin=1", "p_test%2Fadmin", "p_", "a".repeat(513)])("ignores invalid input %s", value => {
    expect(miniStartRoute(value)).toBeNull();
  });
});
