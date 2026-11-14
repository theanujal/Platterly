import { describe, expect, it } from "vitest";
import { PLATFORM_BILLING_ACTIONS, PLATFORM_CHECKOUT_PATH_PATTERN, platformCheckoutPath } from "../src/platform";
import { parseMethodRequest } from "../src/billing";

const biz = `biz_${"a".repeat(32)}`;

describe("payment-method actions", () => {
  it("every billing action, the six method ones included, has a path the Platform's gate lets through", () => {
    for (const action of ["methods", "method-add", "method-add-verify", "method-primary", "method-primary-verify", "method-remove"] as const) {
      expect(PLATFORM_BILLING_ACTIONS).toContain(action);
    }
    for (const action of PLATFORM_BILLING_ACTIONS) expect(PLATFORM_CHECKOUT_PATH_PATTERN.test(platformCheckoutPath(biz, "catering", action)), action).toBe(true);
    expect(PLATFORM_CHECKOUT_PATH_PATTERN.test(`/api/platform/businesses/${biz}/products/catering/billing/method-nope`)).toBe(false);
  });

  it("make-primary and remove need a method id, and nothing else is accepted", () => {
    expect(parseMethodRequest({ methodId: "pm_" + "a".repeat(32) })).toEqual({ ok: true, value: { methodId: "pm_" + "a".repeat(32) } });
    for (const bad of [null, {}, { methodId: "" }, { methodId: 5 }, { methodId: "x".repeat(65) }, { methodId: "has space" }]) expect(parseMethodRequest(bad).ok, JSON.stringify(bad)).toBe(false);
  });
});
