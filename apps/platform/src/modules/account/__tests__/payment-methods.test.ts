import { describe, expect, it } from "vitest";
import type { MethodsAnswer, PlatformBusinessBilling } from "@platterly/contract";
import { loadMyPaymentMethods } from "../payment-methods";

const session = { userId: "u1" } as never;
const sub = (over: Record<string, unknown>) => ({ id: "s", status: "ACTIVE", plan: { id: "p", code: "premium", name: "Premium" }, billingInterval: "MONTHLY", startDate: "2026-11-01", trialEndsAt: null, currentPeriodEnd: "2026-12-01T00:00:00.000Z", pending: null, ...over });
const billing = (products: { productKey: string; name: string; subscription: unknown }[]): PlatformBusinessBilling => ({
  businessId: "biz_x",
  generatedAt: "now",
  products: products.map((p) => ({ productKey: p.productKey, name: p.name, billing: { onlineBillingAvailable: true, subscription: p.subscription, history: [], payments: [] } as never })),
});
const ok = { status: "ok", businessId: "biz_x", businessName: "Spice Route" } as const;
const methods: MethodsAnswer = { methods: [{ id: "pm_1", kind: "CARD", label: "Visa ending 4366", isPrimary: true }], nextChargeAt: "2026-12-01T00:00:00.000Z" };

describe("Account: payment methods for each product", () => {
  it("lists, per product that has a subscription, the plan, the auto-pay state and the saved methods, under the Store's product key", async () => {
    const listed: string[] = [];
    const result = await loadMyPaymentMethods(session, {
      access: async () => ok,
      billing: async () => ({ ok: true, billing: billing([{ productKey: "catering", name: "Caterly", subscription: sub({ autoPay: { status: "ACTIVE", nextChargeAt: "2026-12-01T00:00:00.000Z" } }) }, { productKey: "other", name: "Other", subscription: null }]) }),
      list: async (scope) => (listed.push(scope.opsProductKey), { ok: true, answer: methods }),
    });
    expect(result).toEqual({
      ok: true,
      businessName: "Spice Route",
      products: [{ productKey: "caterly", product: "Caterly", planName: "Premium", interval: "MONTHLY", autoPay: { status: "ACTIVE", nextChargeAt: "2026-12-01T00:00:00.000Z" }, methods: methods.methods }],
    });
    expect(listed).toEqual(["catering"]);
  });

  it("refuses anyone who is not the business's active Admin, without asking Ops", async () => {
    for (const status of ["unauthenticated", "no_business", "not_admin"] as const) {
      let asked = false;
      const result = await loadMyPaymentMethods(session, { access: async () => ({ status }), billing: async () => ((asked = true), { ok: false, reason: "unreachable" }), list: async () => ((asked = true), { ok: false, reason: "unreachable" }) });
      expect(result).toEqual({ ok: false, reason: status === "unauthenticated" ? "not_signed_in" : status });
      expect(asked).toBe(false);
    }
  });

  it("shows nothing for a business Ops does not know yet, and says unavailable when Ops cannot be reached", async () => {
    const base = { access: async () => ok, list: async () => ({ ok: false as const, reason: "unreachable" as const }) };
    expect(await loadMyPaymentMethods(session, { ...base, billing: async () => ({ ok: false, reason: "not_found" }) })).toEqual({ ok: true, businessName: "Spice Route", products: [] });
    expect(await loadMyPaymentMethods(session, { ...base, billing: async () => ({ ok: false, reason: "unreachable" }) })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("a product whose methods cannot be read is shown with an empty list rather than hiding the whole page", async () => {
    const result = await loadMyPaymentMethods(session, { access: async () => ok, billing: async () => ({ ok: true, billing: billing([{ productKey: "catering", name: "Caterly", subscription: sub({}) }]) }), list: async () => ({ ok: false, reason: "unreachable" }) });
    expect(result).toMatchObject({ ok: true, products: [{ productKey: "caterly", autoPay: null, methods: [] , methodsUnavailable: true }] });
  });
});
