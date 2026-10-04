import { EXPENSE_CATEGORY_LABEL, type ExpenseCategoryValue } from "@/modules/expenses/profitability";
import { monthKey, monthLabel } from "./report-math";

/**
 * Chunk 22.2 — the Finance report's arithmetic (PRD §51 Finance): revenue against expenses by month, profit,
 * receivables (what customers still owe) and payables (what is owed to suppliers), both aged. Pure functions.
 * Revenue and expenses follow the date range; receivables and payables are always "as of today".
 */
const round2 = (n: number) => Math.round(n * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export interface FinanceMonthRow {
  month: string;
  label: string;
  revenue: number;
  expenses: number;
  profit: number;
}
export interface FinanceReport {
  revenue: number;
  expenses: number;
  profit: number;
  /** Profit as a share of revenue; null when there is no revenue. */
  marginPercent: number | null;
  months: FinanceMonthRow[];
  expensesByCategory: { category: ExpenseCategoryValue; label: string; amount: number }[];
}

export function computeFinance(
  orders: { total: number; createdAt: Date; status: string }[],
  expenses: { amount: number; spentAt: Date; category: ExpenseCategoryValue }[],
): FinanceReport {
  const months = new Map<string, { revenue: number; expenses: number }>();
  const cats = new Map<ExpenseCategoryValue, number>();
  let revenue = 0;
  let spent = 0;
  for (const order of orders) {
    if (order.status === "CANCELLED") continue;
    revenue += order.total;
    const key = monthKey(order.createdAt, "ist");
    const m = months.get(key) ?? { revenue: 0, expenses: 0 };
    m.revenue += order.total;
    months.set(key, m);
  }
  for (const expense of expenses) {
    spent += expense.amount;
    const key = monthKey(expense.spentAt, "utc");
    const m = months.get(key) ?? { revenue: 0, expenses: 0 };
    m.expenses += expense.amount;
    months.set(key, m);
    cats.set(expense.category, (cats.get(expense.category) ?? 0) + expense.amount);
  }
  return {
    revenue: round2(revenue),
    expenses: round2(spent),
    profit: round2(revenue - spent),
    marginPercent: revenue > 0 ? Math.round(((revenue - spent) / revenue) * 1000) / 10 : null,
    months: [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, m]) => ({ month, label: monthLabel(month), revenue: round2(m.revenue), expenses: round2(m.expenses), profit: round2(m.revenue - m.expenses) })),
    expensesByCategory: [...cats.entries()].map(([category, amount]) => ({ category, label: EXPENSE_CATEGORY_LABEL[category], amount: round2(amount) })).sort((a, b) => b.amount - a.amount),
  };
}

export const RECEIVABLE_BUCKETS = ["Not yet due", "1–30 days late", "31–60 days late", "Over 60 days late"] as const;
export const PAYABLE_BUCKETS = ["0–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

export interface ReceivableOrder {
  id: string;
  orderNumber: string | null;
  customerName: string;
  eventDate: Date;
  balance: number;
  kitchenName?: string;
}
export interface ReceivablesReport {
  total: number;
  orders: number;
  buckets: { label: string; amount: number; orders: number }[];
  biggest: ReceivableOrder[];
}

/** A balance is due on the event date: before it, "not yet due"; after it, aged by how many days late. */
export function computeReceivables(rows: ReceivableOrder[], now: Date = new Date(), top = 10): ReceivablesReport {
  const buckets = RECEIVABLE_BUCKETS.map((label) => ({ label: label as string, amount: 0, orders: 0 }));
  const owing = rows.filter((r) => r.balance > 0);
  for (const row of owing) {
    const late = Math.floor((utcDay(now) - utcDay(row.eventDate)) / DAY_MS);
    const i = late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3;
    buckets[i].amount += row.balance;
    buckets[i].orders += 1;
  }
  return {
    total: round2(owing.reduce((sum, r) => sum + r.balance, 0)),
    orders: owing.length,
    buckets: buckets.map((b) => ({ ...b, amount: round2(b.amount) })),
    biggest: [...owing].sort((a, b) => b.balance - a.balance).slice(0, top),
  };
}

export interface PayableSupplier {
  supplierId: string;
  supplierName: string;
  /** What has been received, one entry per purchase order, with the day it counts from. */
  received: { date: Date; value: number }[];
  paid: number;
}
export interface PayablesReport {
  total: number;
  suppliers: { supplierId: string; supplierName: string; outstanding: number; oldestDays: number }[];
  buckets: { label: string; amount: number }[];
}

/** Payments are applied to the oldest receipts first, so what is left is the newest, and aging shows how old it is. */
export function computePayables(rows: PayableSupplier[], now: Date = new Date()): PayablesReport {
  const buckets = PAYABLE_BUCKETS.map((label) => ({ label: label as string, amount: 0 }));
  const suppliers: PayablesReport["suppliers"] = [];
  for (const row of rows) {
    let credit = row.paid;
    let outstanding = 0;
    let oldest = 0;
    for (const receipt of [...row.received].sort((a, b) => a.date.getTime() - b.date.getTime())) {
      const covered = Math.min(credit, receipt.value);
      credit -= covered;
      const left = receipt.value - covered;
      if (left <= 0.004) continue;
      const age = Math.max(Math.floor((utcDay(now) - utcDay(receipt.date)) / DAY_MS), 0);
      buckets[age <= 30 ? 0 : age <= 60 ? 1 : age <= 90 ? 2 : 3].amount += left;
      outstanding += left;
      oldest = Math.max(oldest, age);
    }
    if (outstanding > 0.004) suppliers.push({ supplierId: row.supplierId, supplierName: row.supplierName, outstanding: round2(outstanding), oldestDays: oldest });
  }
  return {
    total: round2(suppliers.reduce((sum, s) => sum + s.outstanding, 0)),
    suppliers: suppliers.sort((a, b) => b.outstanding - a.outstanding),
    buckets: buckets.map((b) => ({ ...b, amount: round2(b.amount) })),
  };
}
