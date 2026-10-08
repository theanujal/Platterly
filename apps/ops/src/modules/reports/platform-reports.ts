import "server-only";
import type { ReportBlock, ReportDoc } from "@platterly/contract";
import { prisma } from "@/lib/db";
import { monthEnds } from "@/modules/dashboard/dashboard";
import type { InvoiceSnapshot } from "@/modules/billing/math";
import { loadSaasReport, loadSignupsByMonth } from "./saas-report";
import { computeSaas, monthKeyIst, monthLabelOf, recurringRevenue, type SaasPayment, type SaasTrial } from "./saas-math";
import { saasToDoc } from "./saas-doc";
import { toIsoDate } from "./range";

/**
 * The reports Ops builds from its own records (what businesses pay Platterly, who signs up, who leaves, what is sent), as
 * the same display documents a product's own reports use, so one page shows both. Every one can be narrowed to the product
 * picked in the sidebar except where `scoped` is false (Staff activity is about Ops itself).
 */
export type ReportCategory = "Revenue" | "Customers" | "Operations" | "Compliance";
export interface ReportContext {
  range: { from: Date | null; to: Date | null };
  productKey?: string;
  now: Date;
}
export interface PlatformReport {
  key: string;
  label: string;
  category: ReportCategory;
  description: string;
  scoped: boolean;
  build: (ctx: ReportContext) => Promise<ReportDoc>;
}

const DAY = 86_400_000;
const whole = (n: number) => n.toLocaleString("en-IN");
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (part: number, whole_: number) => (whole_ > 0 ? Math.round((part / whole_) * 1000) / 10 : null);
const pctText = (n: number | null) => (n === null ? "—" : `${n}%`);
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const upTo = (range: ReportContext["range"]) => (range.to ? new Date(range.to.getTime() + DAY) : null);
const inRange = (d: Date, range: ReportContext["range"]) => (!range.from || d.getTime() >= range.from.getTime()) && (!range.to || d.getTime() < range.to.getTime() + DAY);
const period = (ctx: ReportContext) => ({ from: ctx.range.from ? toIsoDate(ctx.range.from) : null, to: ctx.range.to ? toIsoDate(ctx.range.to) : null });
const doc = (key: string, title: string, ctx: ReportContext, blocks: ReportBlock[]): ReportDoc => ({ report: key, title, period: period(ctx), blocks });

async function loadPayments(productKey: string | undefined) {
  const rows = await prisma.subscriptionPayment.findMany({
    where: { ...(productKey ? { productKey } : {}), status: "PAID", paidAt: { not: null } },
    select: { id: true, businessId: true, productKey: true, planId: true, plan: { select: { name: true } }, interval: true, amount: true, gstAmount: true, total: true, paidAt: true, periodStart: true, periodEnd: true, invoiceNumber: true, invoiceSnapshot: true, business: { select: { name: true } } },
  });
  const payments: (SaasPayment & { id: string; productKey: string; total: number; invoiceNumber: string | null; snapshot: InvoiceSnapshot | null; businessName: string })[] = rows.map((p) => ({
    id: p.id, businessId: p.businessId, productKey: p.productKey, planId: p.planId, planName: p.plan.name, interval: p.interval, amount: Number(p.amount), gstAmount: Number(p.gstAmount), total: Number(p.total),
    paidAt: p.paidAt!, periodStart: p.periodStart, periodEnd: p.periodEnd, invoiceNumber: p.invoiceNumber, snapshot: (p.invoiceSnapshot as unknown as InvoiceSnapshot | null) ?? null, businessName: p.business.name,
  }));
  return payments;
}

/** Month starts for the last `count` months (India time), oldest first, as [label, start, end]. The current month ends now. */
function months(now: Date, count: number) {
  const ends = monthEnds(now, count);
  return ends.map((e, i) => ({ label: e.label, key: monthKeyIst(e.at), end: e.at, start: i === 0 ? new Date(e.at.getTime() - 31 * DAY) : new Date(ends[i - 1].at.getTime() + 1) }));
}

// ---- Revenue ----
async function revenueTrend(ctx: ReportContext): Promise<ReportDoc> {
  const payments = await loadPayments(ctx.productKey);
  const ms = months(ctx.now, 12);
  const mrr = ms.map((m) => recurringRevenue(payments, m.end).mrr);
  const collected = ms.map((m) => round2(payments.filter((p) => monthKeyIst(p.paidAt) === m.key).reduce((s, p) => s + p.amount, 0)));
  const now = recurringRevenue(payments, ctx.now);
  const inPeriod = payments.filter((p) => inRange(p.paidAt, ctx.range));
  return doc("revenue-trend", "Revenue and MRR trend", ctx, [
    { type: "tiles", tiles: [
      { label: "MRR today", value: inr(now.mrr), hint: "Before GST" },
      { label: "ARR (MRR x 12)", value: inr(now.arr) },
      { label: "Collected in the period", value: inr(round2(inPeriod.reduce((s, p) => s + p.amount, 0))), hint: `${whole(inPeriod.length)} payments, before GST` },
      { label: "Average per paying business", value: now.averagePerKitchen === null ? "—" : inr(now.averagePerKitchen), hint: "A month" },
    ] },
    { type: "chart", title: "MRR at the end of each month", description: "Last 12 months, before GST", kind: "area", labels: ms.map((m) => m.label), series: [{ name: "MRR", values: mrr, format: "currency" }] },
    { type: "chart", title: "Revenue collected by month", description: "By the day each payment was made, before GST", kind: "bar", labels: ms.map((m) => m.label), series: [{ name: "Collected", values: collected, format: "currency" }] },
  ]);
}

async function planMix(ctx: ReportContext): Promise<ReportDoc> {
  const payments = await loadPayments(ctx.productKey);
  const now = recurringRevenue(payments, ctx.now);
  const subs = await prisma.subscription.groupBy({ by: ["status"], where: { ...(ctx.productKey ? { productKey: ctx.productKey } : {}), endDate: null }, _count: true });
  const count = (s: string) => subs.find((x) => x.status === s)?._count ?? 0;
  return doc("plan-mix", "Plan mix", ctx, [
    { type: "tiles", tiles: [{ label: "Paying businesses", value: whole(now.payingKitchens) }, { label: "On trial", value: whole(count("TRIALING")) }, { label: "Locked", value: whole(count("LOCKED")), hint: "Trial or plan ended unpaid" }, { label: "MRR", value: inr(now.mrr), hint: "Before GST" }] },
    { type: "chart", title: "Businesses on each plan", description: "Paying today", kind: "bar", labels: now.byPlan.map((p) => p.planName), series: [{ name: "Businesses", values: now.byPlan.map((p) => p.kitchens) }], emptyText: "No business is paying yet." },
    { type: "table", title: "MRR by plan", columns: [{ label: "Plan" }, { label: "Businesses", align: "right" }, { label: "MRR", align: "right" }, { label: "Share", align: "right" }], rows: now.byPlan.map((p) => [p.planName, whole(p.kitchens), inr(p.mrr), `${p.sharePercent}%`]), emptyText: "No business is paying yet." },
  ]);
}

async function failedPayments(ctx: ReportContext): Promise<ReportDoc> {
  const failed = await prisma.subscriptionPayment.findMany({
    where: { ...(ctx.productKey ? { productKey: ctx.productKey } : {}), status: "FAILED" },
    orderBy: { createdAt: "desc" },
    select: { id: true, businessId: true, total: true, createdAt: true, plan: { select: { name: true } }, business: { select: { name: true } } },
  });
  const paid = await loadPayments(ctx.productKey);
  const firstPaid = new Map<string, Date[]>();
  for (const p of paid) firstPaid.set(p.businessId, [...(firstPaid.get(p.businessId) ?? []), p.paidAt]);
  const recovered = (f: (typeof failed)[number]) => (firstPaid.get(f.businessId) ?? []).some((d) => d.getTime() > f.createdAt.getTime());
  const mine = failed.filter((f) => inRange(f.createdAt, ctx.range));
  const ms = months(ctx.now, 12);
  const atRisk = round2(mine.filter((f) => !recovered(f)).reduce((s, f) => s + Number(f.total), 0));
  return doc("failed-payments", "Failed payments", ctx, [
    { type: "tiles", tiles: [
      { label: "Failed in the period", value: whole(mine.length) },
      { label: "Recovered", value: whole(mine.filter(recovered).length), hint: "The business paid afterwards" },
      { label: "Still unpaid", value: whole(mine.filter((f) => !recovered(f)).length), hint: `${inr(atRisk)} including GST` },
      { label: "Recovery rate", value: pctText(pct(mine.filter(recovered).length, mine.length)) },
    ] },
    { type: "chart", title: "Failed payments by month", description: "Last 12 months", kind: "bar", labels: ms.map((m) => m.label), series: [{ name: "Failed", values: ms.map((m) => failed.filter((f) => monthKeyIst(f.createdAt) === m.key).length) }] },
    { type: "table", title: "Failed payments in the period", columns: [{ label: "When" }, { label: "Business" }, { label: "Plan" }, { label: "Amount", align: "right" }, { label: "Since" }], rows: mine.slice(0, 200).map((f) => [toIsoDate(f.createdAt), f.business.name, f.plan.name, inr(Number(f.total)), recovered(f) ? "Paid afterwards" : "Unpaid"]), emptyText: "No failed payments in this period." },
  ]);
}

// ---- Customers ----
async function signups(ctx: ReportContext): Promise<ReportDoc> {
  const s = await loadSignupsByMonth(ctx.range, ctx.productKey);
  return doc("signups", "Sign-ups", ctx, [
    { type: "tiles", tiles: [{ label: "Businesses", value: whole(s.total), hint: ctx.productKey ? "On this product" : "On every product" }, { label: "New in the period", value: whole(s.inRange) }] },
    { type: "chart", title: "Sign-ups by month", kind: "bar", labels: s.byMonth.map((m) => m.label), series: [{ name: "Sign-ups", values: s.byMonth.map((m) => m.count) }], emptyText: "No sign-ups in this period." },
  ]);
}

async function churn(ctx: ReportContext): Promise<ReportDoc> {
  const payments = await loadPayments(ctx.productKey);
  const ms = months(ctx.now, 12);
  const rows = ms.map((m) => {
    const start = recurringRevenue(payments, m.start).businessIds;
    const end = recurringRevenue(payments, m.end).businessIds;
    const lost = [...start].filter((id) => !end.has(id)).length;
    const gained = [...end].filter((id) => !start.has(id)).length;
    return { label: m.label, start: start.size, gained, lost, end: end.size };
  });
  const from = ctx.range.from ?? new Date(ctx.now.getTime() - 30 * DAY);
  const saas = computeSaas({ payments, trials: [], failedPayments: 0, period: { from, to: ctx.range.to ?? ctx.now }, now: ctx.now });
  return doc("churn", "Churn and retention", ctx, [
    { type: "tiles", tiles: [
      { label: "Business churn", value: pctText(saas.churn.logoChurnPercent), hint: saas.churn.startKitchens ? `${whole(saas.churn.churned ?? 0)} of ${whole(saas.churn.startKitchens)} paying at the start` : "Nobody was paying at the start" },
      { label: "Revenue churn", value: pctText(saas.churn.revenueChurnPercent), hint: saas.churn.churnedMrr === null ? undefined : `${inr(saas.churn.churnedMrr)} of MRR lost` },
      { label: "Retention", value: saas.churn.logoChurnPercent === null ? "—" : `${round2(100 - saas.churn.logoChurnPercent)}%` },
      { label: "Paying today", value: whole(saas.payingKitchens) },
    ] },
    { type: "chart", title: "Gained and lost each month", description: "Paying businesses that started or stopped paying", kind: "bar", labels: rows.map((r) => r.label), series: [{ name: "Gained", values: rows.map((r) => r.gained) }, { name: "Lost", values: rows.map((r) => r.lost) }] },
    { type: "table", title: "Month by month", columns: [{ label: "Month" }, { label: "At start", align: "right" }, { label: "Gained", align: "right" }, { label: "Lost", align: "right" }, { label: "At end", align: "right" }, { label: "Churn", align: "right" }], rows: rows.map((r) => [r.label, whole(r.start), whole(r.gained), whole(r.lost), whole(r.end), pctText(pct(r.lost, r.start))]) },
    { type: "text", title: "How this is worked out", lines: ["A business is paying on a day when a paid plan payment covers it. Lost: paying at the start of the month, not paying at its end. Gained: the opposite.", "Business churn is lost divided by paying at the start; revenue churn weighs each by its monthly payment."] },
  ]);
}

async function trialFunnel(ctx: ReportContext): Promise<ReportDoc> {
  const [trialRows, payments] = await Promise.all([
    prisma.subscription.findMany({ where: { ...(ctx.productKey ? { productKey: ctx.productKey } : {}), plan: { isTrial: true } }, select: { businessId: true, startDate: true, trialEndsAt: true } }),
    loadPayments(ctx.productKey),
  ]);
  const trials: SaasTrial[] = trialRows;
  const saas = computeSaas({ payments, trials, failedPayments: 0, period: ctx.range, now: ctx.now });
  const first = new Map<string, SaasTrial>();
  for (const t of [...trials].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())) if (!first.has(t.businessId)) first.set(t.businessId, t);
  const paidBy = new Map<string, Date[]>();
  for (const p of payments) paidBy.set(p.businessId, [...(paidBy.get(p.businessId) ?? []), p.paidAt]);
  const ms = months(ctx.now, 12);
  const cohort = ms.map((m) => {
    const started = [...first.values()].filter((t) => monthKeyIst(t.startDate) === m.key);
    const converted = started.filter((t) => (paidBy.get(t.businessId) ?? []).some((d) => d.getTime() >= t.startDate.getTime())).length;
    return { label: m.label, started: started.length, converted };
  });
  const t = saas.trials;
  return doc("trial-funnel", "Trial to paid funnel", ctx, [
    { type: "tiles", tiles: [{ label: "Trials started", value: whole(t.started), hint: "In the period" }, { label: "Became paying", value: whole(t.converted) }, { label: "Conversion", value: pctText(t.conversionPercent) }, { label: "Ended unpaid", value: whole(t.endedUnpaid), hint: `${whole(t.runningNow)} still running` }] },
    { type: "bars", title: "Where trials ended up", rows: [
      { label: "Started", value: t.started, text: whole(t.started) },
      { label: "Became paying", value: t.converted, text: `${whole(t.converted)} (${pctText(t.conversionPercent)})` },
      { label: "Ended unpaid", value: t.endedUnpaid, text: whole(t.endedUnpaid) },
      { label: "Still running", value: t.runningNow, text: whole(t.runningNow) },
    ] },
    { type: "chart", title: "Trials by the month they started", description: "And how many of them have paid since", kind: "bar", labels: cohort.map((c) => c.label), series: [{ name: "Started", values: cohort.map((c) => c.started) }, { name: "Paid since", values: cohort.map((c) => c.converted) }] },
  ]);
}

async function usage(ctx: ReportContext): Promise<ReportDoc> {
  const rows = await prisma.businessProduct.findMany({ where: ctx.productKey ? { productKey: ctx.productKey } : {}, select: { productKey: true, lastActiveAt: true, usage: true, product: { select: { name: true } }, business: { select: { id: true, name: true } } } });
  const monthAgo = ctx.now.getTime() - 30 * DAY;
  const byProduct = new Map<string, { name: string; businesses: number; active: number; totals: Record<string, number> }>();
  const perBusiness: { name: string; id: string; product: string; total: number }[] = [];
  for (const r of rows) {
    const p = byProduct.get(r.productKey) ?? { name: r.product.name, businesses: 0, active: 0, totals: {} };
    p.businesses += 1;
    if (r.lastActiveAt && r.lastActiveAt.getTime() >= monthAgo) p.active += 1;
    const counts = (r.usage as { counts?: Record<string, number> } | null)?.counts ?? {};
    let total = 0;
    for (const [k, v] of Object.entries(counts)) { p.totals[k] = (p.totals[k] ?? 0) + v; total += v; }
    byProduct.set(r.productKey, p);
    perBusiness.push({ name: r.business.name, id: r.business.id, product: r.product.name, total });
  }
  const products = [...byProduct.values()];
  return doc("usage", "Usage and adoption", ctx, [
    { type: "tiles", tiles: [{ label: "Businesses", value: whole(rows.length) }, { label: "Active in the last 30 days", value: whole(products.reduce((s, p) => s + p.active, 0)), hint: pctText(pct(products.reduce((s, p) => s + p.active, 0), rows.length)) }] },
    { type: "bars", title: "Active share by product", description: "Businesses seen in the last 30 days", rows: products.map((p) => ({ label: p.name, value: p.businesses ? p.active / p.businesses : 0, text: `${whole(p.active)} of ${whole(p.businesses)}`, sub: pctText(pct(p.active, p.businesses)) })), emptyText: "No business is on a product yet." },
    ...products.map((p): ReportBlock => ({ type: "table", title: `${p.name}: what its businesses have reported`, columns: [{ label: "Measure" }, { label: "Total", align: "right" }], rows: Object.entries(p.totals).sort(([, a], [, b]) => b - a).map(([k, v]) => [k, whole(v)]), emptyText: "Nothing reported yet." })),
    { type: "table", title: "Most active businesses", description: "By everything they have reported", columns: [{ label: "Business" }, { label: "Product" }, { label: "Activity", align: "right" }], rows: perBusiness.sort((a, b) => b.total - a.total).slice(0, 15).map((b) => [b.name, b.product, whole(b.total)]), emptyText: "Nothing reported yet." },
  ]);
}

async function topBusinesses(ctx: ReportContext): Promise<ReportDoc> {
  const [payments, businesses] = await Promise.all([loadPayments(ctx.productKey), prisma.business.findMany({ where: ctx.productKey ? { products: { some: { productKey: ctx.productKey } } } : {}, select: { id: true, name: true, createdAt: true, products: { select: { usage: true, product: { select: { name: true } } } } } })]);
  const rev = recurringRevenue(payments, ctx.now);
  const lifetime = new Map<string, number>();
  for (const p of payments) lifetime.set(p.businessId, (lifetime.get(p.businessId) ?? 0) + p.amount);
  const rows = businesses.map((b) => ({ name: b.name, products: b.products.map((p) => p.product.name).join(", "), mrr: rev.monthlyByOrg.get(b.id) ?? 0, lifetime: lifetime.get(b.id) ?? 0, joined: toIsoDate(b.createdAt) }))
    .sort((a, b) => b.mrr - a.mrr || b.lifetime - a.lifetime).slice(0, 25);
  return doc("top-businesses", "Top businesses", ctx, [
    { type: "table", title: "By monthly revenue", description: "Paying today, then by what they have paid in total (before GST)", columns: [{ label: "Business" }, { label: "Products" }, { label: "MRR", align: "right" }, { label: "Paid in total", align: "right" }, { label: "Joined" }], rows: rows.map((r) => [r.name, r.products, inr(r.mrr), inr(round2(r.lifetime)), r.joined]), emptyText: "No businesses yet." },
  ]);
}

// ---- Compliance ----
async function gst(ctx: ReportContext): Promise<ReportDoc> {
  const payments = (await loadPayments(ctx.productKey)).filter((p) => inRange(p.paidAt, ctx.range)).sort((a, b) => a.paidAt.getTime() - b.paidAt.getTime());
  const split = (p: (typeof payments)[number]) => {
    const lines = p.snapshot?.gst.lines ?? [];
    const sum = (prefix: string) => round2(lines.filter((l) => l.label.startsWith(prefix)).reduce((s, l) => s + l.amount, 0));
    const cgst = sum("CGST"), sgst = sum("SGST"), igst = sum("IGST");
    return { cgst, sgst, igst, other: round2(p.gstAmount - cgst - sgst - igst) };
  };
  const byMonth = new Map<string, { invoices: number; taxable: number; cgst: number; sgst: number; igst: number; other: number }>();
  for (const p of payments) {
    const k = monthKeyIst(p.paidAt);
    const m = byMonth.get(k) ?? { invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, other: 0 };
    const s = split(p);
    m.invoices += 1; m.taxable = round2(m.taxable + p.amount); m.cgst = round2(m.cgst + s.cgst); m.sgst = round2(m.sgst + s.sgst); m.igst = round2(m.igst + s.igst); m.other = round2(m.other + s.other);
    byMonth.set(k, m);
  }
  const total = [...byMonth.values()].reduce((a, m) => ({ invoices: a.invoices + m.invoices, taxable: round2(a.taxable + m.taxable), cgst: round2(a.cgst + m.cgst), sgst: round2(a.sgst + m.sgst), igst: round2(a.igst + m.igst), other: round2(a.other + m.other) }), { invoices: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, other: 0 });
  return doc("gst", "GST report", ctx, [
    { type: "tiles", tiles: [{ label: "Invoices", value: whole(total.invoices) }, { label: "Taxable value", value: inr(total.taxable), hint: "Before GST" }, { label: "CGST + SGST", value: inr(round2(total.cgst + total.sgst)), hint: "Same-state invoices" }, { label: "IGST", value: inr(total.igst), hint: "Other-state invoices" }] },
    { type: "table", title: "By month", description: "By the day each payment was made (India time)", columns: [{ label: "Month" }, { label: "Invoices", align: "right" }, { label: "Taxable value", align: "right" }, { label: "CGST", align: "right" }, { label: "SGST", align: "right" }, { label: "IGST", align: "right" }, { label: "Other GST", align: "right" }], rows: [...byMonth.entries()].map(([k, m]) => [monthLabelOf(k), whole(m.invoices), inr(m.taxable), inr(m.cgst), inr(m.sgst), inr(m.igst), inr(m.other)]), emptyText: "No invoices in this period." },
    { type: "table", title: "Invoices", description: "Buyer GSTIN as it was on the invoice", columns: [{ label: "Invoice" }, { label: "Date" }, { label: "Business" }, { label: "Buyer GSTIN" }, { label: "Taxable", align: "right" }, { label: "GST", align: "right" }, { label: "Total", align: "right" }], rows: payments.slice(0, 500).map((p) => [p.invoiceNumber ?? "—", toIsoDate(p.paidAt), p.businessName, p.snapshot?.buyer.gstin ?? "—", inr(p.amount), inr(p.gstAmount), inr(p.total)]), emptyText: "No invoices in this period." },
  ]);
}

// ---- Operations ----
async function emailDelivery(ctx: ReportContext): Promise<ReportDoc> {
  const rows = await prisma.messageLog.findMany({
    where: { ...(ctx.productKey ? { productKey: ctx.productKey } : {}), createdAt: { ...(ctx.range.from ? { gte: ctx.range.from } : {}), ...(upTo(ctx.range) ? { lt: upTo(ctx.range)! } : {}) } },
    orderBy: { createdAt: "desc" },
    select: { template: true, status: true, toEmail: true, error: true, createdAt: true, attempts: true },
  });
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  const byTemplate = new Map<string, { sent: number; failed: number; other: number }>();
  for (const r of rows) {
    const t = byTemplate.get(r.template) ?? { sent: 0, failed: 0, other: 0 };
    if (r.status === "SENT") t.sent += 1; else if (r.status === "FAILED") t.failed += 1; else t.other += 1;
    byTemplate.set(r.template, t);
  }
  return doc("email-delivery", "Email delivery", ctx, [
    { type: "tiles", tiles: [{ label: "Sent", value: whole(count("SENT")) }, { label: "Failed", value: whole(count("FAILED")), hint: "After every retry" }, { label: "Skipped", value: whole(count("SKIPPED")), hint: "No email provider set" }, { label: "Waiting", value: whole(count("PENDING")), hint: "Will be retried" }] },
    { type: "table", title: "By email type", columns: [{ label: "Template" }, { label: "Sent", align: "right" }, { label: "Failed", align: "right" }, { label: "Other", align: "right" }], rows: [...byTemplate.entries()].map(([k, t]) => [k, whole(t.sent), whole(t.failed), whole(t.other)]), emptyText: "No emails in this period." },
    { type: "table", title: "Recent failures", columns: [{ label: "When" }, { label: "Template" }, { label: "To" }, { label: "Error" }], rows: rows.filter((r) => r.status === "FAILED").slice(0, 50).map((r) => [toIsoDate(r.createdAt), r.template, r.toEmail ?? "—", (r.error ?? "").slice(0, 200)]), emptyText: "No failures." },
  ]);
}

async function staffActivity(ctx: ReportContext): Promise<ReportDoc> {
  const rows = await prisma.auditLog.findMany({
    where: { createdAt: { ...(ctx.range.from ? { gte: ctx.range.from } : {}), ...(upTo(ctx.range) ? { lt: upTo(ctx.range)! } : {}) } },
    orderBy: { createdAt: "desc" },
    take: 5000,
    select: { action: true, subject: true, createdAt: true, actor: { select: { name: true } } },
  });
  const tally = (key: (r: (typeof rows)[number]) => string) => { const m = new Map<string, number>(); for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + 1); return [...m.entries()].sort(([, a], [, b]) => b - a).slice(0, 12); };
  return doc("staff-activity", "Staff activity", ctx, [
    { type: "tiles", tiles: [{ label: "Recorded actions", value: whole(rows.length), hint: rows.length === 5000 ? "Latest 5,000 in the period" : "In the period" }, { label: "By staff", value: whole(rows.filter((r) => r.actor).length) }, { label: "By the system", value: whole(rows.filter((r) => !r.actor).length), hint: "Payments, trial sweeps, publishes" }] },
    { type: "bars", title: "Who did what", rows: tally((r) => r.actor?.name ?? "System").map(([label, n]) => ({ label, value: n, text: whole(n) })), emptyText: "Nothing recorded." },
    { type: "bars", title: "Kinds of action", rows: tally((r) => r.action.split(".")[0]).map(([label, n]) => ({ label, value: n, text: whole(n) })), emptyText: "Nothing recorded." },
    { type: "table", title: "Latest actions", columns: [{ label: "When" }, { label: "Who" }, { label: "Action" }, { label: "About" }], rows: rows.slice(0, 100).map((r) => [toIsoDate(r.createdAt), r.actor?.name ?? "System", r.action, r.subject ?? "—"]), emptyText: "Nothing recorded." },
  ]);
}

export const PLATFORM_REPORTS: PlatformReport[] = [
  { key: "subscriptions", label: "Subscriptions", category: "Revenue", description: "MRR, ARR, revenue collected, plans and trials in one view.", scoped: true, build: async (c) => saasToDoc(await loadSaasReport(c.range, c.productKey, c.now), { periodChosen: Boolean(c.range.from), from: period(c).from, to: period(c).to }) },
  { key: "revenue-trend", label: "Revenue and MRR trend", category: "Revenue", description: "MRR and what was collected, month by month for a year.", scoped: true, build: revenueTrend },
  { key: "plan-mix", label: "Plan mix", category: "Revenue", description: "Who is on which plan, and what each plan earns.", scoped: true, build: planMix },
  { key: "failed-payments", label: "Failed payments", category: "Revenue", description: "Payments that did not go through, and how many were recovered.", scoped: true, build: failedPayments },
  { key: "signups", label: "Sign-ups", category: "Customers", description: "New businesses by month.", scoped: true, build: signups },
  { key: "trial-funnel", label: "Trial to paid funnel", category: "Customers", description: "How many trials turn into paying businesses.", scoped: true, build: trialFunnel },
  { key: "churn", label: "Churn and retention", category: "Customers", description: "Who started and stopped paying, month by month.", scoped: true, build: churn },
  { key: "usage", label: "Usage and adoption", category: "Customers", description: "How much businesses use each product, and who is most active.", scoped: true, build: usage },
  { key: "top-businesses", label: "Top businesses", category: "Customers", description: "Your best businesses by monthly revenue.", scoped: true, build: topBusinesses },
  { key: "gst", label: "GST report", category: "Compliance", description: "Invoices with CGST, SGST and IGST, by month. For your accountant.", scoped: true, build: gst },
  { key: "email-delivery", label: "Email delivery", category: "Operations", description: "Emails sent to businesses, failures and retries.", scoped: true, build: emailDelivery },
  { key: "staff-activity", label: "Staff activity", category: "Operations", description: "What staff and the system did in Ops.", scoped: false, build: staffActivity },
];

export const REPORT_CATEGORIES: ReportCategory[] = ["Revenue", "Customers", "Compliance", "Operations"];
export const platformReport = (key: string) => PLATFORM_REPORTS.find((r) => r.key === key);
