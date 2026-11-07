import { describe, expect, it } from "vitest";
import type { PlatformBusinessBilling } from "@platterly/contract";
import { applyBilling, storeKeyFor } from "../products";
import type { SampleProduct } from "../sample-catalogue";

const product = (key: string): SampleProduct => ({ key, name: key, tagline: "", status: "NONE", plans: [] });
const sub = (over: Record<string, unknown>) => ({ id: "s1", status: "ACTIVE", plan: { id: "plan_premium", code: "premium", name: "Premium" }, billingInterval: "ANNUAL", startDate: "2026-10-30T13:43:45.000Z", trialEndsAt: null, currentPeriodEnd: "2027-10-30T13:43:45.000Z", pending: null, ...over });
const billing = (productKey: string, subscription: unknown): PlatformBusinessBilling =>
  ({ businessId: "biz_" + "a".repeat(32), generatedAt: "2026-11-07T00:00:00.000Z", products: [{ productKey, name: productKey, billing: { onlineBillingAvailable: true, subscription, history: [], payments: [] } }] }) as unknown as PlatformBusinessBilling;

describe("Store: a business's real subscriptions on the products", () => {
  it("an active paid plan is SUBSCRIBED with its plan, frequency and renewal date, and Ops's `catering` is the Store's `caterly`", () => {
    const [p] = applyBilling([product("caterly")], billing("catering", sub({})));
    expect(storeKeyFor("catering")).toBe("caterly");
    expect(p.status).toBe("SUBSCRIBED");
    expect(p.subscription).toEqual({ planId: "plan_premium", planName: "Premium", interval: "ANNUAL", nextRenewal: "2027-10-30" });
  });

  it("a trial is TRIAL with its end date", () => {
    const [p] = applyBilling([product("caterly")], billing("catering", sub({ status: "TRIALING", billingInterval: null, trialEndsAt: "2026-11-14T15:48:03.706Z", currentPeriodEnd: null })));
    expect(p.status).toBe("TRIAL");
    expect(p.trialEndsAt).toBe("2026-11-14");
  });

  it("a locked or cancelled plan, no subscription, and a product Ops did not mention all stay not subscribed", () => {
    for (const status of ["LOCKED", "CANCELLED"]) expect(applyBilling([product("caterly")], billing("catering", sub({ status })))[0].status).toBe("NONE");
    expect(applyBilling([product("caterly")], billing("catering", null))[0].status).toBe("NONE");
    expect(applyBilling([product("rivo")], billing("catering", sub({})))[0].status).toBe("NONE");
  });

  it("a paid plan with no period end still shows, with an empty renewal date", () => {
    const [p] = applyBilling([product("caterly")], billing("catering", sub({ currentPeriodEnd: null })));
    expect(p.subscription?.nextRenewal).toBe("");
  });
});
