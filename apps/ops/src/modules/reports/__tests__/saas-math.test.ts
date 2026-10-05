import { describe, it, expect } from "vitest";
import { computeSaas, monthlyValue, recurringRevenue, type SaasPayment, type SaasPeriod, type SaasTrial } from "../saas-math";

const d = (iso: string) => new Date(`${iso}T10:00:00Z`);
const pay = (businessId: string, planName: string, interval: "MONTHLY" | "ANNUAL", amount: number, paid: string, start: string, end: string): SaasPayment => ({
  businessId,
  planId: planName.toLowerCase(),
  planName,
  interval,
  amount,
  gstAmount: Math.round(amount * 0.18 * 100) / 100,
  paidAt: d(paid),
  periodStart: d(start),
  periodEnd: d(end),
});

// A: Pro monthly, renewed in February. B: Premium yearly. C: Pro monthly, never renewed. E: Pro monthly at 1,500, converted from a trial.
const payments: SaasPayment[] = [
  pay("A", "Pro", "MONTHLY", 1000, "2026-01-01", "2026-01-01", "2026-02-01"),
  pay("A", "Pro", "MONTHLY", 1000, "2026-02-01", "2026-02-01", "2026-03-01"),
  pay("B", "Premium", "ANNUAL", 12000, "2026-01-10", "2026-01-10", "2027-01-10"),
  pay("C", "Pro", "MONTHLY", 1000, "2026-01-05", "2026-01-05", "2026-02-05"),
  pay("E", "Pro", "MONTHLY", 1500, "2026-01-20", "2026-01-20", "2026-02-20"),
];
const trials: SaasTrial[] = [
  { businessId: "D", startDate: d("2026-02-01"), trialEndsAt: d("2026-02-08") },
  { businessId: "E", startDate: d("2026-01-01"), trialEndsAt: d("2026-01-08") },
  { businessId: "F", startDate: d("2026-02-10"), trialEndsAt: d("2026-02-17") },
];
const now = d("2026-02-15");
const all: SaasPeriod = { from: null, to: null };
const report = (period = all, failedPayments = 2) => computeSaas({ payments, trials, failedPayments, period, now });

describe("monthly value", () => {
  it("a yearly payment counts one twelfth a month", () => {
    expect(monthlyValue({ interval: "MONTHLY", amount: 1000 })).toBe(1000);
    expect(monthlyValue({ interval: "ANNUAL", amount: 12000 })).toBe(1000);
  });
});

describe("MRR and ARR", () => {
  it("adds what each paying kitchen pays per month today, from the payment that covers today", () => {
    const r = report();
    expect(r.payingKitchens).toBe(3); // A, B, E; C's month ended on 5 Feb
    expect(r.mrr).toBe(3500);
    expect(r.arr).toBe(42000);
    expect(r.averagePerKitchen).toBe(1166.67);
  });

  it("splits MRR by plan with shares that add up", () => {
    const [pro, premium] = report().mrrByPlan;
    expect(pro).toMatchObject({ planName: "Pro", kitchens: 2, mrr: 2500, sharePercent: 71.4 });
    expect(premium).toMatchObject({ planName: "Premium", kitchens: 1, mrr: 1000, sharePercent: 28.6 });
  });

  it("is zero, with no average, when nobody is paying", () => {
    const r = computeSaas({ payments: [], trials: [], failedPayments: 0, period: all, now });
    expect(r).toMatchObject({ mrr: 0, arr: 0, payingKitchens: 0, averagePerKitchen: null, revenue: 0, newPayingKitchens: 0, lapsedNow: 0 });
    expect(r.trials.conversionPercent).toBeNull();
  });

  it("uses the later period when two payments overlap, and ignores a payment with no period", () => {
    const overlap = [pay("A", "Pro", "MONTHLY", 1000, "2026-02-01", "2026-02-01", "2026-03-01"), pay("A", "Premium", "MONTHLY", 3000, "2026-02-10", "2026-02-10", "2026-03-10"), { ...pay("Z", "Pro", "MONTHLY", 500, "2026-02-01", "2026-02-01", "2026-03-01"), periodStart: null }];
    expect(recurringRevenue(overlap, now).mrr).toBe(3000);
    expect(recurringRevenue(overlap, now).payingKitchens).toBe(1);
  });
});

describe("revenue", () => {
  it("is what was collected before GST, by plan and by month, with GST shown separately", () => {
    const r = report();
    expect(r.revenue).toBe(16500);
    expect(r.gstCollected).toBe(2970);
    expect(r.payments).toBe(5);
    expect(r.revenueByPlan).toEqual([
      { planId: "premium", planName: "Premium", payments: 1, revenue: 12000, sharePercent: 72.7 },
      { planId: "pro", planName: "Pro", payments: 4, revenue: 4500, sharePercent: 27.3 },
    ]);
    expect(r.revenueByMonth).toEqual([
      { month: "2026-01", label: "Jan 2026", payments: 4, revenue: 15500 },
      { month: "2026-02", label: "Feb 2026", payments: 1, revenue: 1000 },
    ]);
  });

  it("follows the period, both ends included", () => {
    const feb = report({ from: d("2026-02-01"), to: d("2026-02-28") });
    expect(feb.revenue).toBe(1000);
    expect(feb.newPayingKitchens).toBe(0);
    expect(report({ from: d("2026-01-01"), to: d("2026-01-31") }).revenue).toBe(15500);
    expect(report({ from: d("2026-01-01"), to: d("2026-01-31") }).newPayingKitchens).toBe(4);
  });

  it("counts failed payments as given", () => {
    expect(report(all, 7).failedPayments).toBe(7);
  });
});

describe("trials", () => {
  it("counts kitchens whose trial started in the period, how many paid since, and what is left", () => {
    const t = report().trials;
    expect(t).toMatchObject({ started: 3, converted: 1, endedUnpaid: 1, runningNow: 1 });
    expect(t.conversionPercent).toBe(33.3);
  });

  it("only looks at trials started inside the period", () => {
    expect(report({ from: d("2026-01-01"), to: d("2026-01-31") }).trials).toMatchObject({ started: 1, converted: 1, conversionPercent: 100 });
  });
});

describe("churn", () => {
  it("is a share of the kitchens paying on the first day who are not paying on the last", () => {
    const r = report({ from: d("2026-01-15"), to: d("2026-02-10") }).churn;
    expect(r).toEqual({ startKitchens: 3, churned: 1, logoChurnPercent: 33.3, revenueChurnPercent: 33.3, churnedMrr: 1000 });
  });

  it("is zero when everyone paying at the start still pays at the end", () => {
    expect(report({ from: d("2026-01-15"), to: d("2026-01-31") }).churn).toMatchObject({ startKitchens: 3, churned: 0, logoChurnPercent: 0, churnedMrr: 0 });
  });

  it("cannot be measured without a first day", () => {
    expect(report().churn).toEqual({ startKitchens: null, churned: null, logoChurnPercent: null, revenueChurnPercent: null, churnedMrr: null });
  });

  it("never looks past today, and counts kitchens whose paid time has run out", () => {
    expect(report({ from: d("2026-01-15"), to: d("2027-12-31") }).churn.churned).toBe(1);
    expect(report().lapsedNow).toBe(1); // C
  });
});
