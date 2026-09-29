import { describe, expect, it } from "vitest";
import { securePaymentUrl } from "./payment-url.js";

describe("securePaymentUrl", () => {
  it("accepts an HTTPS provider redirect", () => {
    expect(securePaymentUrl("https://yookassa.test/pay/order-1?token=abc"))
      .toBe("https://yookassa.test/pay/order-1?token=abc");
  });

  it.each([
    "http://yookassa.test/pay/order-1",
    "javascript:alert(1)",
    "//yookassa.test/pay/order-1",
    "https://user:password@yookassa.test/pay/order-1",
    "not-a-url",
    undefined,
  ])("rejects an unsafe payment redirect: %s", (value) => {
    expect(securePaymentUrl(value)).toBeUndefined();
  });
});
