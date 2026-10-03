/**
 * Chunk 17.1 — the arithmetic behind the Sales and Events reports (PRD §51). Pure functions over plain rows, with no
 * database, so every figure is unit-tested and the kitchen view and the Super Admin view cannot disagree.
 *
 * Rules (shared with Profitability, AJ 2026-10-03): revenue is the order total; a cancelled order never counts; a
 * "confirmed" order has been approved (Approved, Sent to Kitchen or Completed).
 */

export type ReportOrderStatus = "PENDING_REVIEW" | "AWAITING_CUSTOMER_APPROVAL" | "APPROVED" | "SENT_TO_KITCHEN" | "COMPLETED" | "CANCELLED";

export const CONFIRMED_STATUSES: ReportOrderStatus[] = ["APPROVED", "SENT_TO_KITCHEN", "COMPLETED"];

export interface ReportOrder {
  id: string;
  orderNumber: string | null;
  customerName: string;
  status: ReportOrderStatus;
  total: number;
  createdAt: Date;
  eventStartDate: Date;
  guests: number | null;
  eventType: string | null;
  kitchenId?: string;
  kitchenName?: string;
}

export interface ReportCustomer {
  createdAt: Date;
  hasOrder: boolean;
}

export interface ReportQuotation {
  total: number;
  status: "DRAFT" | "SENT" | "VIEWED" | "CHANGES_REQUESTED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** "2026-10" for the month a moment falls in. `tz` "ist" for when something happened, "utc" for an event's calendar date. */
export function monthKey(date: Date, tz: "ist" | "utc"): string {
  const d = tz === "ist" ? new Date(date.getTime() + IST_OFFSET_MS) : date;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
}

const counted = (orders: ReportOrder[]) => orders.filter((o) => o.status !== "CANCELLED");

export interface MonthRow {
  month: string;
  label: string;
  count: number;
  guests: number;
  revenue: number;
}

function byMonth(orders: ReportOrder[], tz: "ist" | "utc", field: "createdAt" | "eventStartDate"): MonthRow[] {
  const map = new Map<string, MonthRow>();
  for (const o of counted(orders)) {
    const key = monthKey(o[field], tz);
    const row = map.get(key) ?? { month: key, label: monthLabel(key), count: 0, guests: 0, revenue: 0 };
    row.count += 1;
    row.guests += o.guests ?? 0;
    row.revenue = round2(row.revenue + o.total);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface SalesReport {
  revenue: number;
  orders: number;
  averageOrderValue: number | null;
  confirmedOrders: number;
  confirmedOrderValue: number;
  enquiries: number;
  converted: number;
  /** Share of the people who enquired in the period who have placed an order; null when nobody enquired. */
  conversionRate: number | null;
  /** Quotations that were sent to a customer (everything but a draft). */
  quotationsSent: number;
  quotationValue: number;
  acceptedQuotationValue: number;
  revenueByMonth: MonthRow[];
}

export function computeSales(orders: ReportOrder[], customers: ReportCustomer[], quotations: ReportQuotation[]): SalesReport {
  const live = counted(orders);
  const revenue = round2(live.reduce((s, o) => s + o.total, 0));
  const confirmed = live.filter((o) => CONFIRMED_STATUSES.includes(o.status));
  const sent = quotations.filter((q) => q.status !== "DRAFT");
  const converted = customers.filter((c) => c.hasOrder).length;
  return {
    revenue,
    orders: live.length,
    averageOrderValue: live.length > 0 ? round2(revenue / live.length) : null,
    confirmedOrders: confirmed.length,
    confirmedOrderValue: round2(confirmed.reduce((s, o) => s + o.total, 0)),
    enquiries: customers.length,
    converted,
    conversionRate: customers.length > 0 ? Math.round((converted / customers.length) * 1000) / 10 : null,
    quotationsSent: sent.length,
    quotationValue: round2(sent.reduce((s, q) => s + q.total, 0)),
    acceptedQuotationValue: round2(sent.filter((q) => q.status === "ACCEPTED").reduce((s, q) => s + q.total, 0)),
    revenueByMonth: byMonth(orders, "ist", "createdAt"),
  };
}

export interface TypeRow {
  name: string;
  count: number;
  guests: number;
  revenue: number;
}

export interface EventsReport {
  events: number;
  guests: number;
  averageGuests: number | null;
  revenue: number;
  byMonth: MonthRow[];
  byType: TypeRow[];
  /** The biggest events by revenue (at most `topEvents`). */
  topEvents: ReportOrder[];
}

export function computeEvents(orders: ReportOrder[], topEvents = 20): EventsReport {
  const live = counted(orders);
  const guests = live.reduce((s, o) => s + (o.guests ?? 0), 0);
  const withGuests = live.filter((o) => o.guests !== null && o.guests > 0);
  const types = new Map<string, TypeRow>();
  for (const o of live) {
    const name = o.eventType ?? "No event type";
    const row = types.get(name) ?? { name, count: 0, guests: 0, revenue: 0 };
    row.count += 1;
    row.guests += o.guests ?? 0;
    row.revenue = round2(row.revenue + o.total);
    types.set(name, row);
  }
  return {
    events: live.length,
    guests,
    averageGuests: withGuests.length > 0 ? Math.round(withGuests.reduce((s, o) => s + (o.guests ?? 0), 0) / withGuests.length) : null,
    revenue: round2(live.reduce((s, o) => s + o.total, 0)),
    byMonth: byMonth(orders, "utc", "eventStartDate"),
    byType: [...types.values()].sort((a, b) => b.revenue - a.revenue || a.name.localeCompare(b.name)),
    topEvents: [...live].sort((a, b) => b.total - a.total || a.eventStartDate.getTime() - b.eventStartDate.getTime()).slice(0, topEvents),
  };
}

export interface KitchenRow {
  kitchenId: string;
  kitchenName: string;
  orders: number;
  revenue: number;
  averageOrderValue: number | null;
  guests: number;
}

/** Platform view: how each kitchen did, biggest revenue first. */
export function computeKitchens(orders: ReportOrder[]): KitchenRow[] {
  const map = new Map<string, KitchenRow>();
  for (const o of counted(orders)) {
    if (!o.kitchenId) continue;
    const row = map.get(o.kitchenId) ?? { kitchenId: o.kitchenId, kitchenName: o.kitchenName ?? "Kitchen", orders: 0, revenue: 0, averageOrderValue: null, guests: 0 };
    row.orders += 1;
    row.revenue = round2(row.revenue + o.total);
    row.guests += o.guests ?? 0;
    map.set(o.kitchenId, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, averageOrderValue: r.orders > 0 ? round2(r.revenue / r.orders) : null }))
    .sort((a, b) => b.revenue - a.revenue || a.kitchenName.localeCompare(b.kitchenName));
}
