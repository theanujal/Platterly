import type { ReportDoc } from "@platterly/contract";
import type { SaasReport } from "./saas-math";

const whole = (n: number) => n.toLocaleString("en-IN");
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const plural = (n: number, one: string) => `${whole(n)} ${n === 1 ? one : `${one}s`}`;

/** The Subscriptions report (what businesses pay Platterly) as the same display document a product's reports use, so one renderer shows both. Amounts are before GST. */
export function saasToDoc(saas: SaasReport, input: { periodChosen: boolean; from: string | null; to: string | null }): ReportDoc {
  const c = saas.churn;
  const churnHint = c.startKitchens === null ? (input.periodChosen ? "Choose a period with a first day" : "Choose a period, such as This month") : `${whole(c.churned ?? 0)} of ${whole(c.startKitchens)} paying at the start stopped${c.revenueChurnPercent === null ? "" : `; ${percent(c.revenueChurnPercent)} of revenue`}`;
  return {
    report: "subscriptions",
    title: "Subscriptions",
    period: { from: input.from, to: input.to },
    blocks: [
      {
        type: "tiles",
        tiles: [
          { label: "MRR (monthly recurring revenue)", value: inr(saas.mrr), hint: "What paying businesses pay per month, today, before GST" },
          { label: "ARR (annual run rate)", value: inr(saas.arr), hint: "MRR x 12" },
          { label: "Paying businesses", value: whole(saas.payingKitchens), ...(saas.averagePerKitchen === null ? {} : { hint: `${inr(saas.averagePerKitchen)} a month each, on average` }) },
          { label: "Locked for non-payment", value: whole(saas.lapsedNow), hint: "Paid before, not covered today" },
          { label: "Revenue collected", value: inr(saas.revenue), hint: `${plural(saas.payments, "payment")} in the period, before GST` },
          { label: "GST collected", value: inr(saas.gstCollected), hint: "Passed on, not income" },
          { label: "New paying businesses", value: whole(saas.newPayingKitchens), hint: "First payment in the period" },
          { label: "Failed payments", value: whole(saas.failedPayments), hint: "Attempts that did not go through" },
        ],
      },
      {
        type: "tiles",
        tiles: [
          { label: "Trials started", value: whole(saas.trials.started), hint: "In the period" },
          { label: "Trial conversion", value: percent(saas.trials.conversionPercent), hint: `${whole(saas.trials.converted)} of ${whole(saas.trials.started)} have paid since` },
          { label: "Trials ended unpaid", value: whole(saas.trials.endedUnpaid), hint: `${whole(saas.trials.runningNow)} still running now` },
          { label: "Churn", value: percent(c.logoChurnPercent), hint: churnHint },
        ],
      },
      { type: "bars", title: "MRR by plan", description: "Who pays what per month today.", emptyText: "No business is paying yet.", rows: saas.mrrByPlan.map((p) => ({ label: p.planName, value: p.mrr, text: `${inr(p.mrr)} (${p.sharePercent}%)`, sub: plural(p.kitchens, "business") })) },
      { type: "bars", title: "Revenue by plan", description: "Collected in the period, before GST.", rows: saas.revenueByPlan.map((p) => ({ label: p.planName, value: p.revenue, text: `${inr(p.revenue)} (${p.sharePercent}%)`, sub: plural(p.payments, "payment") })) },
      { type: "bars", title: "Revenue by month", description: "By the day each payment was made (India time), before GST.", rows: saas.revenueByMonth.map((m) => ({ label: m.label, value: m.revenue, text: inr(m.revenue), sub: plural(m.payments, "payment") })) },
      {
        type: "text",
        title: "How these are worked out",
        lines: [
          "A business is paying on a day when one of its paid plan payments covers that day. A yearly payment counts one twelfth a month.",
          "Amounts are before GST: GST is collected for the government, not earned. Only paid payments count.",
          "Trial conversion: of the businesses whose trial started in the period, the share that has paid since.",
          "Churn: of the businesses paying on the first day of the period, the share no longer paying on its last day (never later than today).",
        ],
      },
    ],
  };
}
