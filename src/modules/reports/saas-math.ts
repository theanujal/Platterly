/**
 * Chunk 24.2 — the arithmetic behind Super Admin's Subscriptions report: MRR, ARR, revenue by plan, trial
 * conversion and churn. Pure functions over plain rows (no database), so every figure is unit-tested.
 *
 * Definitions (stated on the page too):
 *  - A kitchen is **paying** on a day when one of its paid plan payments covers that day (periodStart <= day < periodEnd).
 *  - **MRR** adds up what each paying kitchen pays per month: a monthly payment as it is, a yearly one divided by 12.
 *    Amounts are before GST, because GST is collected for the government, not earned.
 *  - **ARR** is MRR x 12.
 *  - **Revenue** is what was actually collected (paid payments), before GST, by the day it was paid (India time).
 *  - **Trial conversion**: of the kitchens whose trial started in the period, the share that has paid since.
 *  - **Churn**: of the kitchens paying on the first day of the period, the share no longer paying on its last day.
 */
export interface SaasPayment {
  organizationId: string;
  planId: string;
  planName: string;
  interval: "MONTHLY" | "ANNUAL";
  /** Rupees, before GST. */
  amount: number;
  gstAmount: number;
  paidAt: Date;
  periodStart: Date | null;
  periodEnd: Date | null;
}

export interface SaasTrial {
  organizationId: string;
  startDate: Date;
  trialEndsAt: Date | null;
}

export interface SaasPeriod {
  from: Date | null;
  to: Date | null;
}

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export const monthlyValue = (p: Pick<SaasPayment, "interval" | "amount">) => (p.interval === "ANNUAL" ? p.amount / 12 : p.amount);

/** The payment that makes a kitchen paying on `at`, if any: the one covering that moment that started latest. */
function covering(payments: SaasPayment[], at: Date): SaasPayment | null {
  let best: SaasPayment | null = null;
  for (const p of payments) {
    if (!p.periodStart || !p.periodEnd) continue;
    if (p.periodStart.getTime() <= at.getTime() && at.getTime() < p.periodEnd.getTime()) {
      if (!best || p.periodStart.getTime() > best.periodStart!.getTime() || (p.periodStart.getTime() === best.periodStart!.getTime() && p.paidAt.getTime() > best.paidAt.getTime())) best = p;
    }
  }
  return best;
}

function groupByOrg(payments: SaasPayment[]): Map<string, SaasPayment[]> {
  const map = new Map<string, SaasPayment[]>();
  for (const p of payments) map.set(p.organizationId, [...(map.get(p.organizationId) ?? []), p]);
  return map;
}

export interface PlanMrrRow {
  planId: string;
  planName: string;
  kitchens: number;
  mrr: number;
  sharePercent: number;
}

/** Who is paying on a given moment, and what that comes to per month. */
export function recurringRevenue(payments: SaasPayment[], at: Date) {
  const rows: { organizationId: string; payment: SaasPayment; monthly: number }[] = [];
  for (const [organizationId, list] of groupByOrg(payments)) {
    const payment = covering(list, at);
    if (payment) rows.push({ organizationId, payment, monthly: monthlyValue(payment) });
  }
  const mrr = round2(rows.reduce((sum, r) => sum + r.monthly, 0));
  const plans = new Map<string, PlanMrrRow>();
  for (const r of rows) {
    const row = plans.get(r.payment.planId) ?? { planId: r.payment.planId, planName: r.payment.planName, kitchens: 0, mrr: 0, sharePercent: 0 };
    row.kitchens += 1;
    row.mrr = round2(row.mrr + r.monthly);
    plans.set(r.payment.planId, row);
  }
  const byPlan = [...plans.values()].map((p) => ({ ...p, sharePercent: pct(p.mrr, mrr) ?? 0 })).sort((a, b) => b.mrr - a.mrr);
  return { mrr, arr: round2(mrr * 12), payingKitchens: rows.length, averagePerKitchen: rows.length > 0 ? round2(mrr / rows.length) : null, byPlan, organizationIds: new Set(rows.map((r) => r.organizationId)), monthlyByOrg: new Map(rows.map((r) => [r.organizationId, r.monthly])) };
}

export function monthKeyIst(date: Date): string {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabelOf(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

export interface SaasReport {
  mrr: number;
  arr: number;
  payingKitchens: number;
  averagePerKitchen: number | null;
  mrrByPlan: PlanMrrRow[];
  /** Collected in the period. */
  revenue: number;
  gstCollected: number;
  payments: number;
  revenueByPlan: { planId: string; planName: string; payments: number; revenue: number; sharePercent: number }[];
  revenueByMonth: { month: string; label: string; payments: number; revenue: number }[];
  newPayingKitchens: number;
  failedPayments: number;
  trials: { started: number; converted: number; conversionPercent: number | null; runningNow: number; endedUnpaid: number };
  churn: { startKitchens: number | null; churned: number | null; logoChurnPercent: number | null; revenueChurnPercent: number | null; churnedMrr: number | null };
  /** Kitchens that have paid before but are not covered now: locked until they pay. */
  lapsedNow: number;
}

/** `periodStartAnchor` is where an open-ended ("all time") period begins; without a start there is no churn to measure. */
export function computeSaas(input: { payments: SaasPayment[]; trials: SaasTrial[]; failedPayments: number; period: SaasPeriod; now: Date }): SaasReport {
  const { payments, trials, period, now } = input;
  const inPeriod = (d: Date) => (!period.from || d.getTime() >= period.from.getTime()) && (!period.to || d.getTime() < period.to.getTime() + DAY_MS);

  const current = recurringRevenue(payments, now);

  // Revenue collected in the period.
  const collected = payments.filter((p) => inPeriod(p.paidAt));
  const revenue = round2(collected.reduce((s, p) => s + p.amount, 0));
  const plans = new Map<string, { planId: string; planName: string; payments: number; revenue: number }>();
  const months = new Map<string, { month: string; label: string; payments: number; revenue: number }>();
  for (const p of collected) {
    const plan = plans.get(p.planId) ?? { planId: p.planId, planName: p.planName, payments: 0, revenue: 0 };
    plan.payments += 1;
    plan.revenue = round2(plan.revenue + p.amount);
    plans.set(p.planId, plan);
    const key = monthKeyIst(p.paidAt);
    const month = months.get(key) ?? { month: key, label: monthLabelOf(key), payments: 0, revenue: 0 };
    month.payments += 1;
    month.revenue = round2(month.revenue + p.amount);
    months.set(key, month);
  }

  // Kitchens whose very first payment falls in the period.
  const byOrg = groupByOrg(payments);
  let newPaying = 0;
  for (const list of byOrg.values()) {
    const first = list.reduce((a, b) => (a.paidAt.getTime() <= b.paidAt.getTime() ? a : b));
    if (inPeriod(first.paidAt)) newPaying += 1;
  }

  // Trials started in the period, and what became of them. A kitchen's first trial row counts once.
  const firstTrial = new Map<string, SaasTrial>();
  for (const t of [...trials].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) if (!firstTrial.has(t.organizationId)) firstTrial.set(t.organizationId, t);
  const started = [...firstTrial.values()].filter((t) => inPeriod(t.startDate));
  const paidSince = (t: SaasTrial) => (byOrg.get(t.organizationId) ?? []).some((p) => p.paidAt.getTime() >= t.startDate.getTime());
  const converted = started.filter(paidSince).length;
  const endedUnpaid = started.filter((t) => !paidSince(t) && t.trialEndsAt !== null && t.trialEndsAt.getTime() < now.getTime()).length;
  const runningNow = [...firstTrial.values()].filter((t) => !byOrg.has(t.organizationId) && t.trialEndsAt !== null && t.trialEndsAt.getTime() >= now.getTime()).length;

  // Churn needs a first day: of those paying then, who is not paying on the last day (never later than now).
  let churn: SaasReport["churn"] = { startKitchens: null, churned: null, logoChurnPercent: null, revenueChurnPercent: null, churnedMrr: null };
  if (period.from) {
    const end = period.to ? new Date(Math.min(period.to.getTime() + DAY_MS - 1, now.getTime())) : now;
    const atStart = recurringRevenue(payments, period.from);
    const atEnd = recurringRevenue(payments, end);
    const lost = [...atStart.organizationIds].filter((id) => !atEnd.organizationIds.has(id));
    const churnedMrr = round2(lost.reduce((s, id) => s + (atStart.monthlyByOrg.get(id) ?? 0), 0));
    churn = {
      startKitchens: atStart.payingKitchens,
      churned: lost.length,
      logoChurnPercent: pct(lost.length, atStart.payingKitchens),
      revenueChurnPercent: pct(churnedMrr, atStart.mrr),
      churnedMrr,
    };
  }

  const lapsedNow = [...byOrg.keys()].filter((id) => !current.organizationIds.has(id)).length;

  return {
    mrr: current.mrr,
    arr: current.arr,
    payingKitchens: current.payingKitchens,
    averagePerKitchen: current.averagePerKitchen,
    mrrByPlan: current.byPlan,
    revenue,
    gstCollected: round2(collected.reduce((s, p) => s + p.gstAmount, 0)),
    payments: collected.length,
    revenueByPlan: [...plans.values()].map((p) => ({ ...p, sharePercent: pct(p.revenue, revenue) ?? 0 })).sort((a, b) => b.revenue - a.revenue),
    revenueByMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    newPayingKitchens: newPaying,
    failedPayments: input.failedPayments,
    trials: { started: started.length, converted, conversionPercent: pct(converted, started.length), runningNow, endedUnpaid },
    churn,
    lapsedNow,
  };
}
