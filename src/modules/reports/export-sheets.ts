import type { Sheet } from "@/lib/export/tabular";
import type { EventsReport, KitchenRow, SalesReport } from "./report-math";
import type { MenuReport } from "./menu-math";
import type { MovementReport, PurchaseReport, StockReport } from "./inventory-math";
import type { FinanceReport, PayablesReport, ReceivablesReport } from "./finance-math";
import type { ChannelRow, StorefrontReport } from "./storefront-math";
import type { SaasReport } from "./saas-math";
import { EXPENSE_CATEGORY_LABEL, type OrderExpenseCategory, type Profitability } from "@/modules/expenses/profitability";
import type { ExpenseListRow } from "@/modules/expenses/expense";
import type { AuditEntry } from "@/modules/audit/audit-log";

/**
 * Chunk 24 — turns each report into sheets for the CSV and Excel export. The figures are the ones the page shows (the
 * same loaders), written as numbers (rupees, plain counts, percentages as the number before the % sign) so a
 * spreadsheet can add them up. Pure, so it is unit-tested without a database.
 */
const iso = (d: Date) => d.toISOString().slice(0, 10);
const summary = (title: string, pairs: [string, string | number | null][]): Sheet => ({ title, columns: ["Measure", "Value"], rows: pairs });

export function salesSheets(sales: SalesReport, byLocation = false): Sheet[] {
  const pairs: [string, string | number | null][] = [
    ["Revenue (order totals, ₹)", sales.revenue],
    ["Orders (cancelled left out)", sales.orders],
    ["Average order value (₹)", sales.averageOrderValue],
    ["Confirmed orders", sales.confirmedOrders],
    ["Confirmed order value (₹)", sales.confirmedOrderValue],
  ];
  if (!byLocation) {
    pairs.push(
      ["Enquiries", sales.enquiries],
      ["Converted to an order", sales.converted],
      ["Conversion rate (%)", sales.conversionRate],
      ["Quotations sent", sales.quotationsSent],
      ["Quotation value (₹)", sales.quotationValue],
      ["Accepted quotation value (₹)", sales.acceptedQuotationValue],
    );
  }
  return [
    summary("Sales summary", pairs),
    { title: "Revenue by month", columns: ["Month", "Orders", "Guests", "Revenue (₹)"], rows: sales.revenueByMonth.map((m) => [m.label, m.count, m.guests, m.revenue]) },
  ];
}

export function kitchensSheet(kitchens: KitchenRow[]): Sheet {
  return { title: "Kitchens", columns: ["Kitchen", "Orders", "Revenue (₹)", "Average order (₹)", "Guests"], rows: kitchens.map((k) => [k.kitchenName, k.orders, k.revenue, k.averageOrderValue, k.guests]) };
}

export function eventsSheets(events: EventsReport): Sheet[] {
  return [
    summary("Events summary", [
      ["Events (cancelled left out)", events.events],
      ["Total guests", events.guests],
      ["Average guests per event", events.averageGuests],
      ["Revenue (order totals, ₹)", events.revenue],
    ]),
    { title: "Events by month", columns: ["Month", "Events", "Guests", "Revenue (₹)"], rows: events.byMonth.map((m) => [m.label, m.count, m.guests, m.revenue]) },
    { title: "Events by type", columns: ["Type", "Events", "Guests", "Revenue (₹)"], rows: events.byType.map((t) => [t.name, t.count, t.guests, t.revenue]) },
    {
      title: "Biggest events",
      columns: ["Order", "Customer", "Event type", "Event date", "Guests", "Revenue (₹)", "Kitchen"],
      rows: events.topEvents.map((o) => [o.orderNumber, o.customerName, o.eventType, iso(o.eventStartDate), o.guests, o.total, o.kitchenName]),
    },
  ];
}

export function menuSheets(menu: MenuReport): Sheet[] {
  const dish = (rows: MenuReport["mostSelected"]) => rows.map((d) => [d.name, d.orders, d.asExtra] as (string | number)[]);
  return [
    summary("Menu summary", [
      ["Orders counted", menu.ordersCounted],
      ["Different dishes picked", menu.distinctDishes],
      ["Dishes never picked", menu.neverPicked.total],
    ]),
    { title: "Most selected dishes", columns: ["Dish", "Orders", "As an extra"], rows: dish(menu.mostSelected) },
    { title: "Least selected dishes", columns: ["Dish", "Orders", "As an extra"], rows: dish(menu.leastSelected) },
    { title: "Never picked", columns: ["Dish"], rows: menu.neverPicked.names.map((n) => [n]) },
    {
      title: "Menu Type performance",
      columns: ["Menu Type", "Orders", "Meals", "Revenue (₹)", "Average per order (₹)", "Share (%)"],
      rows: menu.menuTypes.map((m) => [m.name, m.orders, m.meals, m.revenue, m.avgPerOrder, m.sharePercent]),
    },
  ];
}

export function inventorySheets(stock: StockReport, movements: MovementReport, purchases: PurchaseReport): Sheet[] {
  return [
    summary("Stock summary", [
      ["Items", stock.items],
      ["Stock value (₹)", stock.totalValue],
      ["Items without a cost", stock.itemsWithoutCost],
      ["Stock movements", movements.movements],
      ["Stock in value (₹)", movements.stockInValue],
      ["Stock out value (₹)", movements.stockOutValue],
      ["Adjustment value (₹)", movements.adjustmentValue],
      ["Taken for orders (movements)", movements.takenForOrders],
      ["Ordered from suppliers (₹)", purchases.orderedValue],
      ["Received from suppliers (₹)", purchases.receivedValue],
      ["Still to receive (₹)", purchases.stillToReceive],
    ]),
    { title: "Stock value by category", columns: ["Category", "Items", "Value (₹)"], rows: stock.byCategory.map((c) => [c.category, c.items, c.value]) },
    { title: "Low stock", columns: ["Item", "Unit", "Stock", "Alert at"], rows: stock.lowStock.map((i) => [i.name, i.unit, i.stock, i.threshold]) },
    { title: "Expiring soon", columns: ["Item", "Unit", "Stock", "Expires", "Days left"], rows: stock.expiring.map((i) => [i.name, i.unit, i.stock, iso(i.expiryDate), i.daysLeft]) },
    { title: "Busiest items", columns: ["Item", "Unit", "In", "Out", "Movements"], rows: movements.busiest.map((b) => [b.name, b.unit, b.inQty, b.outQty, b.moves]) },
    { title: "Purchases by supplier", columns: ["Supplier", "Orders", "Ordered (₹)", "Received (₹)"], rows: purchases.bySupplier.map((s) => [s.supplierName, s.orders, s.orderedValue, s.receivedValue]) },
  ];
}

export function financeSheets(finance: FinanceReport, receivables: ReceivablesReport, payables: PayablesReport, byLocation = false): Sheet[] {
  const sheets: Sheet[] = [
    summary("Finance summary", [
      ["Revenue (order totals, ₹)", finance.revenue],
      ["Expenses (₹)", finance.expenses],
      ["Profit (₹)", finance.profit],
      ["Profit margin (%)", finance.marginPercent],
      ["Owed to you (₹)", receivables.total],
      ["Orders with a balance", receivables.orders],
      ...(byLocation ? [] : ([["You owe suppliers (₹)", payables.total]] as [string, number][])),
    ]),
    { title: "Revenue and expenses by month", columns: ["Month", "Revenue (₹)", "Expenses (₹)", "Profit (₹)"], rows: finance.months.map((m) => [m.label, m.revenue, m.expenses, m.profit]) },
    { title: "Expenses by category", columns: ["Category", "Amount (₹)"], rows: finance.expensesByCategory.map((c) => [c.label, c.amount]) },
    { title: "Receivables by age", columns: ["Age", "Amount (₹)", "Orders"], rows: receivables.buckets.map((b) => [b.label, b.amount, b.orders]) },
    {
      title: "Biggest balances",
      columns: ["Order", "Customer", "Event date", "Balance (₹)", "Kitchen"],
      rows: receivables.biggest.map((o) => [o.orderNumber, o.customerName, iso(o.eventDate), o.balance, o.kitchenName]),
    },
  ];
  if (!byLocation) {
    sheets.push(
      { title: "Payables by age", columns: ["Age", "Amount (₹)"], rows: payables.buckets.map((b) => [b.label, b.amount]) },
      { title: "Owed to suppliers", columns: ["Supplier", "Outstanding (₹)", "Oldest unpaid (days)"], rows: payables.suppliers.map((s) => [s.supplierName, s.outstanding, s.oldestDays]) },
    );
  }
  return sheets;
}

export function channelsSheet(channels: ChannelRow[]): Sheet {
  return { title: "Orders by channel", columns: ["Channel", "Orders", "Share (%)", "Average order (₹)", "Revenue (₹)"], rows: channels.map((c) => [c.label, c.orders, c.sharePercent, c.avgOrder, c.revenue]) };
}

/** Visit figures happen before anyone picks a location, so a location-scoped export carries only the orders by channel. */
export function storefrontSheets(s: StorefrontReport, channels: ChannelRow[], byLocation = false): Sheet[] {
  if (byLocation) return [channelsSheet(channels)];
  const count = (title: string, label: string, rows: { label: string; count: number }[]): Sheet => ({ title, columns: [label, "Visits"], rows: rows.map((r) => [r.label, r.count]) });
  return [
    summary("Storefront summary", [
      ["Visits", s.visits],
      ["Visitors", s.visitors],
      ["Started the form", s.started],
      ["Orders placed", s.submitted],
      ["Visit to order (%)", s.conversionPercent],
    ]),
    { title: "Visitors by source", columns: ["Source", "Visits", "Visitors", "Share (%)"], rows: s.bySource.map((r) => [r.label, r.visits, r.visitors, r.sharePercent]) },
    { title: s.seriesUnit === "day" ? "Visits by day" : "Visits by month", columns: [s.seriesUnit === "day" ? "Day" : "Month", "Visits"], rows: s.series.map((p) => [p.label, p.visits]) },
    {
      title: "Visit to order",
      columns: ["Source", "Visits", "Started", "Reached review", "Ordered", "Visit to order (%)"],
      rows: s.funnel.map((r) => [r.label, r.visits, r.started, r.reachedReview, r.submitted, r.conversionPercent]),
    },
    channelsSheet(channels),
    count("Devices", "Device", s.devices),
    count("Browsers", "Browser", s.browsers),
    count("Countries", "Country", s.countries),
    count("Cities", "City", s.cities),
    count("Websites showing your frame", "Website", s.embedSites),
    count("Other websites linking to you", "Website", s.referralSites),
    count("Your own link tags", "Tag", s.campaignTags),
  ];
}

// ---------------------------------------------------------------------------------------------- Profitability, Expenses, Audit Log

const ORDER_CATEGORIES: OrderExpenseCategory[] = ["FOOD", "LABOUR", "TRANSPORT", "EQUIPMENT", "VENUE", "MISC"];

export interface ProfitabilityExportRow extends Profitability {
  orderNumber: string | null;
  customerName: string;
  eventTypeName: string | null;
  eventStartDate: Date;
  venue: string | null;
  expenseCount: number;
}

/** One row per order, as the Profitability page lists them, with the six expense categories alongside. */
export function profitabilitySheets(rows: ProfitabilityExportRow[]): Sheet[] {
  return [
    {
      title: "Profitability",
      columns: ["Order", "Customer", "Event type", "Event date", "Venue", "Revenue (₹)", "Cost (₹)", "Profit (₹)", "Margin (%)", "Food cost (%)", "Expenses recorded", ...ORDER_CATEGORIES.map((c) => `${EXPENSE_CATEGORY_LABEL[c]} (₹)`)],
      rows: rows.map((r) => [r.orderNumber, r.customerName, r.eventTypeName, iso(r.eventStartDate), r.venue, r.revenue, r.totalCost, r.profit, r.marginPercent, r.foodCostPercent, r.expenseCount, ...ORDER_CATEGORIES.map((c) => r.byCategory[c])]),
    },
  ];
}

/** Every expense, order and company, newest first. Receipt files are named, not embedded. */
export function expensesSheets(rows: ExpenseListRow[]): Sheet[] {
  return [
    {
      title: "Expenses",
      columns: ["Date", "Applies to", "Order", "Customer", "Category", "Amount (₹)", "Payment method", "Supplier", "Notes", "Repeats", "Receipts"],
      rows: rows.map((e) => [
        iso(e.spentAt),
        e.orderId ? "Order" : "Company",
        e.orderNumber,
        e.customerName,
        EXPENSE_CATEGORY_LABEL[e.category],
        e.amount,
        e.paymentMethod ? e.paymentMethod.replace("_", " ").toLowerCase() : null,
        e.supplierName,
        e.notes,
        e.recurring ? e.recurring.frequency.toLowerCase() : null,
        e.attachments.map((a) => a.fileName).join("; ") || null,
      ]),
    },
  ];
}

const IST = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

/** The audit log with each change on its own line of text, so a bookkeeper can read who changed what without opening the app. */
export function auditSheets(entries: AuditEntry[]): Sheet[] {
  return [
    {
      title: "Audit log",
      columns: ["When (India time)", "Who", "What happened", "Action code", "Record", "Record id", "Changes"],
      rows: entries.map((e) => [IST.format(e.createdAt), e.who, e.summary, e.action, e.recordType, e.recordId, e.changes.map((c) => `${c.field}: ${c.before ?? "-"} -> ${c.after ?? "-"}`).join("; ") || null]),
    },
  ];
}

/** The first sheet of every report export: what it is, for whom, for which period and when it was made. */
export function aboutSheet(info: { report: string; kitchen?: string; location?: string | null; from?: Date | null; to?: Date | null; note?: string; now?: Date }): Sheet {
  const period = info.from || info.to ? `${info.from ? iso(info.from) : "the beginning"} to ${info.to ? iso(info.to) : "today"}` : "All time";
  const pairs: [string, string | number | null][] = [["Report", info.report]];
  if (info.kitchen) pairs.push(["Kitchen", info.kitchen]);
  if (info.location !== undefined) pairs.push(["Location", info.location ?? "All locations"]);
  pairs.push(["Period", period], ["Made on", IST.format(info.now ?? new Date()) + " (India time)"]);
  if (info.note) pairs.push(["Note", info.note]);
  return { title: "About this export", columns: ["", ""], rows: pairs };
}

/** Super Admin's Subscriptions report: what kitchens pay Platterly, before GST. */
export function saasSheets(r: SaasReport): Sheet[] {
  return [
    summary("Subscriptions summary", [
      ["MRR today, before GST (₹)", r.mrr],
      ["ARR (MRR x 12, ₹)", r.arr],
      ["Paying kitchens", r.payingKitchens],
      ["Average a month per kitchen (₹)", r.averagePerKitchen],
      ["Locked for non-payment", r.lapsedNow],
      ["Revenue collected in the period, before GST (₹)", r.revenue],
      ["GST collected (₹)", r.gstCollected],
      ["Payments in the period", r.payments],
      ["New paying kitchens", r.newPayingKitchens],
      ["Failed payments", r.failedPayments],
      ["Trials started", r.trials.started],
      ["Trials converted to paying", r.trials.converted],
      ["Trial conversion (%)", r.trials.conversionPercent],
      ["Trials ended unpaid", r.trials.endedUnpaid],
      ["Trials running now", r.trials.runningNow],
      ["Kitchens paying at the start of the period", r.churn.startKitchens],
      ["Kitchens churned", r.churn.churned],
      ["Logo churn (%)", r.churn.logoChurnPercent],
      ["Churned MRR (₹)", r.churn.churnedMrr],
      ["Revenue churn (% of MRR)", r.churn.revenueChurnPercent],
    ]),
    { title: "MRR by plan", columns: ["Plan", "Kitchens", "MRR (₹)", "Share (%)"], rows: r.mrrByPlan.map((p) => [p.planName, p.kitchens, p.mrr, p.sharePercent]) },
    { title: "Revenue by plan", columns: ["Plan", "Payments", "Revenue (₹)", "Share (%)"], rows: r.revenueByPlan.map((p) => [p.planName, p.payments, p.revenue, p.sharePercent]) },
    { title: "Revenue by month", columns: ["Month", "Payments", "Revenue (₹)"], rows: r.revenueByMonth.map((m) => [m.label, m.payments, m.revenue]) },
  ];
}
