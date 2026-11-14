import { describe, expect, it } from "vitest";
import { describeSubscription } from "../status";
import { applyBilling } from "../products";
import type { PlatformBusinessBilling } from "@platterly/contract";
import type { SampleProduct } from "../sample-catalogue";

const NOW = new Date("2026-11-20T10:00:00.000Z");
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

describe("how a subscription reads to a person", () => {
  it("none, trial, ended trial", () => {
    expect(describeSubscription(null, NOW)).toMatchObject({ state: "none", tone: "none" });
    expect(describeSubscription({ status: "TRIALING", trialEndsAt: days(5) }, NOW)).toMatchObject({ state: "trial", label: "On trial" });
    expect(describeSubscription({ status: "TRIALING", trialEndsAt: days(-1) }, NOW)).toMatchObject({ state: "trial_ended", tone: "bad" });
  });

  it("a paid plan is Active until its period ends, Payment due for the 7 days of grace, then Locked", () => {
    const at = (offset: number) => describeSubscription({ status: "ACTIVE", currentPeriodEnd: days(offset) }, NOW);
    expect(at(30)).toMatchObject({ state: "active", label: "Active", tone: "good" });
    expect(at(-1)).toMatchObject({ state: "payment_due", label: "Payment due", tone: "warn" });
    expect(at(-1).detail).toMatch(/full access until 26 Nov 2026/);
    expect(at(-6.9)).toMatchObject({ state: "payment_due" });
    expect(at(-7)).toMatchObject({ state: "locked", tone: "bad" });
    expect(at(-30)).toMatchObject({ state: "locked" });
  });

  it("a cancelled plan is Ending until its period ends, then Ended inside the grace, then Locked", () => {
    const at = (offset: number) => describeSubscription({ status: "ACTIVE", currentPeriodEnd: days(offset), cancelledAt: days(-3) }, NOW);
    expect(at(10)).toMatchObject({ state: "ending", label: "Ending" });
    expect(at(-2)).toMatchObject({ state: "ended_in_grace", label: "Ended" });
    expect(at(-8)).toMatchObject({ state: "locked" });
  });

  it("LOCKED and CANCELLED statuses from Ops are Locked; PAST_DUE (never set today) reads like a plan whose dates say so", () => {
    expect(describeSubscription({ status: "LOCKED" }, NOW).state).toBe("locked");
    expect(describeSubscription({ status: "CANCELLED" }, NOW).state).toBe("locked");
    expect(describeSubscription({ status: "PAST_DUE", currentPeriodEnd: days(-2) }, NOW).state).toBe("payment_due");
  });
});

describe("the Store's product cards use those states", () => {
  const product = (key: string): SampleProduct => ({ key, name: key, tagline: "", status: "NONE", plans: [] });
  const billing = (sub: Record<string, unknown>) =>
    ({ businessId: "biz_" + "a".repeat(32), generatedAt: NOW.toISOString(), products: [{ productKey: "catering", name: "Caterly", billing: { onlineBillingAvailable: true, history: [], payments: [], subscription: { id: "s", plan: { id: "p", code: "c", name: "Pro" }, billingInterval: "ANNUAL", startDate: days(-300), trialEndsAt: null, pending: null, ...sub } } }] }) as unknown as PlatformBusinessBilling;

  it("a plan in its grace stays under Subscribed and says Payment due; past the grace it moves to Not subscribed and says Locked", () => {
    const inGrace = applyBilling([product("caterly")], billing({ status: "ACTIVE", currentPeriodEnd: days(-2) }), NOW)[0];
    expect(inGrace.status).toBe("SUBSCRIBED");
    expect(inGrace.display?.state).toBe("payment_due");
    const locked = applyBilling([product("caterly")], billing({ status: "ACTIVE", currentPeriodEnd: days(-9) }), NOW)[0];
    expect(locked.status).toBe("NONE");
    expect(locked.display?.state).toBe("locked");
    const lockedByOps = applyBilling([product("caterly")], billing({ status: "LOCKED", currentPeriodEnd: days(-9) }), NOW)[0];
    expect(lockedByOps).toMatchObject({ status: "NONE", display: { state: "locked" } });
  });

  it("an ended trial is Not subscribed with its reason; a running trial is On trial", () => {
    expect(applyBilling([product("caterly")], billing({ status: "TRIALING", billingInterval: null, trialEndsAt: days(-1), currentPeriodEnd: null }), NOW)[0]).toMatchObject({ status: "NONE", display: { state: "trial_ended" } });
    expect(applyBilling([product("caterly")], billing({ status: "TRIALING", billingInterval: null, trialEndsAt: days(4), currentPeriodEnd: null }), NOW)[0]).toMatchObject({ status: "TRIAL", display: { state: "trial" } });
  });
});

describe("a failed auto-pay renewal (R4)", () => {
  const sub = (offset: number, autoPay: string, extra: object = {}) => describeSubscription({ status: "ACTIVE", currentPeriodEnd: days(offset), autoPay: { status: autoPay }, ...extra }, NOW);
  it("reads Payment due with its own wording while Razorpay is retrying, and says when full access ends", () => {
    const d = sub(-1, "PENDING");
    expect(d).toMatchObject({ state: "payment_due", label: "Payment due", tone: "warn" });
    expect(d.detail).toMatch(/last payment did not go through.*Update your payment method.*try your payment method again.*until 26 Nov 2026/);
  });
  it("also after Razorpay gave up (HALTED), without promising a retry", () => {
    const d = sub(-2, "HALTED");
    expect(d.state).toBe("payment_due");
    expect(d.detail).not.toMatch(/try your payment method again/);
  });
  it("is Locked once the 7 days have passed, and a healthy or cancelled auto-pay is unchanged", () => {
    expect(sub(-8, "HALTED").state).toBe("locked");
    expect(sub(30, "ACTIVE").state).toBe("active");
    expect(sub(-1, "ACTIVE").detail).toMatch(/paid days ended/);
    expect(sub(-1, "PENDING", { cancelledAt: days(-3) }).state).toBe("ended_in_grace");
  });
});
