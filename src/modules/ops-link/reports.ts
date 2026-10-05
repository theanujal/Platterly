import "server-only";
import type { ReportBarRow, ReportBlock, ReportDoc, ReportListing } from "@platterly/contract";
import { inr } from "@/modules/invoices/invoice-format";
import { loadEventsReport, loadSalesReport } from "@/modules/reports/reports";
import { loadFinanceReport, loadInventoryReport, loadStorefrontReport } from "@/modules/reports/more-reports";
import { parseIsoDate, toIsoDate } from "@/modules/expenses/date-range";

/**
 * The platform reports catering publishes to Platterly Ops (docs/ops-contract.md section 23): the same figures the old Super
 * Admin reports showed, added up across every kitchen, as display-ready documents. Product-wide totals only: no customer
 * names, phone numbers or addresses leave catering (the contract's rule), so the biggest-order tables show the order
 * number and the kitchen, not the customer.
 */
export const CATERING_REPORTS: ReportListing[] = [
  { key: "sales", label: "Sales" },
  { key: "events", label: "Events" },
  { key: "finance", label: "Finance" },
  { key: "inventory", label: "Inventory" },
  { key: "storefront", label: "Storefront" },
];

const whole = (n: number) => n.toLocaleString("en-IN");
const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const plural = (n: number, one: string, many = `${one}s`) => `${whole(n)} ${n === 1 ? one : many}`;
const day = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

const tiles = (list: { label: string; value: string; hint?: string }[]): ReportBlock => ({ type: "tiles", tiles: list });
const bars = (title: string, rows: ReportBarRow[], description?: string, emptyText?: string): ReportBlock => ({ type: "bars", title, rows, ...(description ? { description } : {}), ...(emptyText ? { emptyText } : {}) });
const table = (title: string, columns: [string, boolean?][], rows: string[][], description?: string): ReportBlock => ({
  type: "table",
  title,
  columns: columns.map(([label, right]) => ({ label, ...(right ? { align: "right" as const } : {}) })),
  rows,
  ...(description ? { description } : {}),
});

type Range = { from: Date | null; to: Date | null };

async function sales(range: Range): Promise<ReportBlock[]> {
  const s = await loadSalesReport({ all: true }, range);
  return [
    tiles([
      { label: "Revenue (order totals)", value: inr(s.revenue) },
      { label: "Orders", value: whole(s.orders), hint: "Cancelled orders are left out" },
      { label: "Average order value", value: s.averageOrderValue === null ? "—" : inr(s.averageOrderValue) },
      { label: "Confirmed order value", value: inr(s.confirmedOrderValue), hint: `${whole(s.confirmedOrders)} approved, in the kitchen or completed` },
      { label: "Enquiries", value: whole(s.enquiries), hint: "People added in the period" },
      { label: "Conversion rate", value: percent(s.conversionRate), hint: `${whole(s.converted)} of ${whole(s.enquiries)} placed an order` },
      { label: "Quotation value", value: inr(s.quotationValue), hint: `${whole(s.quotationsSent)} sent, drafts not counted` },
      { label: "Accepted quotation value", value: inr(s.acceptedQuotationValue) },
      { label: "Kitchens with orders", value: whole(s.kitchens.length) },
    ]),
    bars("Revenue by month", s.revenueByMonth.map((m) => ({ label: m.label, value: m.revenue, text: inr(m.revenue), sub: plural(m.count, "order") })), "Orders counted in the month they were placed."),
    table("Kitchens", [["Kitchen"], ["Orders", true], ["Guests", true], ["Average order", true], ["Revenue", true]], s.kitchens.map((k) => [k.kitchenName, whole(k.orders), whole(k.guests), k.averageOrderValue === null ? "—" : inr(k.averageOrderValue), inr(k.revenue)]), "Every kitchen with orders in the period, biggest revenue first."),
  ];
}

async function events(range: Range): Promise<ReportBlock[]> {
  const e = await loadEventsReport({ all: true }, range);
  return [
    tiles([
      { label: "Events", value: whole(e.events), hint: "Cancelled orders are left out" },
      { label: "Total guests", value: whole(e.guests) },
      { label: "Average guests per event", value: e.averageGuests === null ? "—" : whole(e.averageGuests) },
      { label: "Revenue (order totals)", value: inr(e.revenue) },
    ]),
    bars("Events by month", e.byMonth.map((m) => ({ label: m.label, value: m.count, text: plural(m.count, "event"), sub: `${whole(m.guests)} guests · ${inr(m.revenue)}` })), "By the date of the event."),
    table("Events by type", [["Type"], ["Events", true], ["Guests", true], ["Revenue", true]], e.byType.map((t) => [t.name, whole(t.count), whole(t.guests), inr(t.revenue)])),
    table("Revenue per event", [["Order"], ["Kitchen"], ["Event date"], ["Type"], ["Guests", true], ["Revenue", true]], e.topEvents.map((o) => [o.orderNumber ?? "Order", o.kitchenName ?? "—", day.format(o.eventStartDate), o.eventType ?? "—", o.guests === null ? "—" : whole(o.guests), inr(o.total)]), "The biggest events in the period by revenue (up to 20)."),
  ];
}

async function finance(range: Range): Promise<ReportBlock[]> {
  const { finance: f, receivables: r, payables: p } = await loadFinanceReport({ all: true }, range);
  return [
    tiles([
      { label: "Revenue (order totals)", value: inr(f.revenue), hint: "Cancelled orders are left out" },
      { label: "Expenses", value: inr(f.expenses) },
      { label: "Profit", value: inr(f.profit), hint: f.marginPercent === null ? undefined : `${percent(f.marginPercent)} of revenue` },
      { label: "Owed by customers", value: inr(r.total), hint: `${plural(r.orders, "order")} with a balance. Owed to suppliers: ${inr(p.total)}` },
    ]),
    table("Revenue and expenses by month", [["Month"], ["Revenue", true], ["Expenses", true], ["Profit", true]], f.months.map((m) => [m.label, inr(m.revenue), inr(m.expenses), inr(m.profit)]), "Revenue by the month the order was placed, expenses by the date they were spent."),
    bars("Expenses by category", f.expensesByCategory.map((c) => ({ label: c.label, value: c.amount, text: inr(c.amount) }))),
    bars("Receivables: what customers still owe", r.buckets.map((b) => ({ label: b.label, value: b.amount, text: inr(b.amount), sub: plural(b.orders, "order") })), "As of today, not limited to the date range. A balance is due on the event date."),
    table("Biggest balances", [["Order"], ["Kitchen"], ["Event date"], ["Balance", true]], r.biggest.map((o) => [o.orderNumber ?? "Order", o.kitchenName ?? "—", day.format(o.eventDate), inr(o.balance)])),
    bars("Payables: what kitchens owe suppliers", p.buckets.map((b) => ({ label: b.label, value: b.amount, text: inr(b.amount) })), "Stock received minus payments made, as of today."),
  ];
}

async function inventory(range: Range): Promise<ReportBlock[]> {
  const { stock, movements, purchases } = await loadInventoryReport({ all: true }, range);
  return [
    tiles([
      { label: "Stock value", value: inr(stock.totalValue), hint: stock.itemsWithoutCost ? `${whole(stock.itemsWithoutCost)} items have no cost, counted as 0` : "Stock on hand x cost per unit, as of today" },
      { label: "Low-stock items", value: whole(stock.lowStock.length) },
      { label: "Purchases ordered", value: inr(purchases.orderedValue), hint: plural(purchases.orders, "purchase order") },
      { label: "Received so far", value: inr(purchases.receivedValue), hint: `${inr(purchases.stillToReceive)} still to arrive` },
      { label: "Stock movements", value: whole(movements.movements), hint: "In the period" },
      { label: "Stock in (value)", value: inr(movements.stockInValue) },
      { label: "Stock out (value)", value: inr(movements.stockOutValue), hint: `${whole(movements.takenForOrders)} taken for orders` },
      { label: "Adjustments (value)", value: inr(movements.adjustmentValue), hint: "Negative means stock written down" },
    ]),
    bars("Stock value by category", stock.byCategory.map((c) => ({ label: c.category, value: c.value, text: inr(c.value), sub: plural(c.items, "item") })), "As of today, not limited to the date range.", "No inventory items yet."),
    table("Purchases by supplier", [["Supplier"], ["Orders", true], ["Ordered", true], ["Received", true]], purchases.bySupplier.map((s) => [s.supplierName, whole(s.orders), inr(s.orderedValue), inr(s.receivedValue)]), "Purchase orders placed in the period (drafts and cancelled ones are left out)."),
  ];
}

async function storefront(range: Range): Promise<ReportBlock[]> {
  const { storefront: s, channels } = await loadStorefrontReport({ all: true }, range);
  const reviewed = s.funnel.reduce((sum, r) => sum + r.reachedReview, 0);
  return [
    tiles([
      { label: "Visits", value: whole(s.visits), hint: "One per person per session; bots are left out" },
      { label: "Visitors", value: whole(s.visitors), hint: "Same person on the same day counts once" },
      { label: "Started the form", value: whole(s.started) },
      { label: "Orders placed", value: whole(s.submitted), hint: s.conversionPercent === null ? undefined : `${percent(s.conversionPercent)} of visits` },
    ]),
    bars("Where visitors came from", s.bySource.map((r) => ({ label: r.label, value: r.visits, text: `${whole(r.visits)} (${r.sharePercent}%)`, sub: plural(r.visitors, "visitor") })), undefined, "No visits recorded in this period."),
    bars(s.seriesUnit === "day" ? "Visits by day" : "Visits by month", s.series.map((pt) => ({ label: pt.label, value: pt.visits, text: whole(pt.visits) })), undefined, "No visits recorded in this period."),
    bars("From a visit to an order", [
      { label: "Visited", value: s.visits, text: whole(s.visits) },
      { label: "Started the form", value: s.started, text: whole(s.started) },
      { label: "Reached review", value: reviewed, text: whole(reviewed) },
      { label: "Placed an order", value: s.submitted, text: whole(s.submitted) },
    ]),
    table("Orders by channel", [["Channel"], ["Orders", true], ["Share", true], ["Average order", true], ["Revenue", true]], channels.map((c) => [c.label, whole(c.orders), `${c.sharePercent}%`, inr(c.avgOrder), inr(c.revenue)]), "Which door each order came in through (cancelled orders left out)."),
    bars("Devices", s.devices.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))),
    bars("Browsers", s.browsers.map((d) => ({ label: d.label, value: d.count, text: whole(d.count) }))),
  ];
}

const BUILDERS: Record<string, { title: string; build: (range: Range) => Promise<ReportBlock[]> }> = {
  sales: { title: "Sales", build: sales },
  events: { title: "Events", build: events },
  finance: { title: "Finance", build: finance },
  inventory: { title: "Inventory", build: inventory },
  storefront: { title: "Storefront", build: storefront },
};

/** Builds one report across every kitchen, or null for a key this product does not publish. `from`/`to` are YYYY-MM-DD; blank means no limit. */
export async function buildReport(key: string, from: string | null, to: string | null): Promise<ReportDoc | null> {
  if (!Object.hasOwn(BUILDERS, key)) return null;
  const range = { from: parseIsoDate(from ?? undefined), to: parseIsoDate(to ?? undefined) };
  const { title, build } = BUILDERS[key];
  return { report: key, title, period: { from: range.from ? toIsoDate(range.from) : null, to: range.to ? toIsoDate(range.to) : null }, blocks: await build(range) };
}
