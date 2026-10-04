import { describe, it, expect } from "vitest";
import { aboutSheet, auditSheets, channelsSheet, expensesSheets, financeSheets, profitabilitySheets, saasSheets, salesSheets, storefrontSheets } from "../export-sheets";
import { computeSaas } from "../saas-math";
import type { SalesReport } from "../report-math";
import type { FinanceReport, PayablesReport, ReceivablesReport } from "../finance-math";
import type { StorefrontReport } from "../storefront-math";
import { toCsv } from "@/lib/export/tabular";

const sales: SalesReport = { revenue: 75000, orders: 2, averageOrderValue: 37500, confirmedOrders: 1, confirmedOrderValue: 45000, enquiries: 4, converted: 2, conversionRate: 50, quotationsSent: 3, quotationValue: 90000, acceptedQuotationValue: 40000, revenueByMonth: [{ month: "2026-10", label: "Oct 2026", count: 2, guests: 150, revenue: 75000 }] };
const finance: FinanceReport = { revenue: 1000, expenses: 200, profit: 800, marginPercent: 80, months: [{ month: "2026-10", label: "Oct 2026", revenue: 1000, expenses: 200, profit: 800 }], expensesByCategory: [{ category: "FOOD", label: "Food", amount: 200 }] };
const receivables: ReceivablesReport = { total: 500, orders: 1, buckets: [{ label: "Not yet due", amount: 500, orders: 1 }], biggest: [{ id: "o1", orderNumber: "ORD-1", customerName: "Asha", eventDate: new Date("2026-12-01"), balance: 500 }] };
const payables: PayablesReport = { total: 300, suppliers: [{ supplierId: "s", supplierName: "Fresh Mart", outstanding: 300, oldestDays: 5 }], buckets: [{ label: "0-30 days", amount: 300 }] };

const col = (sheet: { columns: string[]; rows: unknown[][] }, name: string) => sheet.rows.map((r) => r[sheet.columns.indexOf(name)]);

describe("report export sheets (Chunk 24)", () => {
  it("writes money and counts as numbers a spreadsheet can add up, with the unit in the column name", () => {
    const [summary, byMonth] = salesSheets(sales);
    expect(summary.rows[0]).toEqual(["Revenue (order totals, ₹)", 75000]);
    expect(col(byMonth, "Revenue (₹)")).toEqual([75000]);
    expect(col(byMonth, "Month")).toEqual(["Oct 2026"]);
  });

  it("leaves enquiries, conversion and quotations out of a location's sales, like the page", () => {
    const labels = (byLocation: boolean) => salesSheets(sales, byLocation)[0].rows.map((r) => r[0]);
    expect(labels(false)).toContain("Enquiries");
    expect(labels(true)).not.toContain("Enquiries");
    expect(labels(true)).not.toContain("Quotation value (₹)");
  });

  it("leaves payables out of a location's finance, like the page", () => {
    expect(financeSheets(finance, receivables, payables).map((s) => s.title)).toContain("Owed to suppliers");
    const located = financeSheets(finance, receivables, payables, true);
    expect(located.map((s) => s.title)).not.toContain("Owed to suppliers");
    expect(located[0].rows.map((r) => r[0])).not.toContain("You owe suppliers (₹)");
  });

  it("keeps only the orders by channel in a location's storefront export", () => {
    const channels = [{ channel: "TEAM" as const, label: "Created by your team", orders: 2, revenue: 1000, avgOrder: 500, sharePercent: 100 }];
    const located = storefrontSheets({} as StorefrontReport, channels, true);
    expect(located).toHaveLength(1);
    expect(located[0]).toEqual(channelsSheet(channels));
  });

  it("describes the export on its first sheet: report, kitchen, location, period and when", () => {
    const about = aboutSheet({ report: "Sales report", kitchen: "Bhandary's", location: "North", from: new Date("2026-10-01"), to: new Date("2026-10-31"), now: new Date("2026-10-04T10:00:00Z") });
    expect(about.rows).toEqual([["Report", "Sales report"], ["Kitchen", "Bhandary's"], ["Location", "North"], ["Period", "2026-10-01 to 2026-10-31"], ["Made on", "4 Oct 2026, 3:30 pm (India time)"]]);
    expect(aboutSheet({ report: "r", location: null, now: new Date("2026-10-04T10:00:00Z") }).rows).toContainEqual(["Period", "All time"]);
    expect(aboutSheet({ report: "r", location: null }).rows).toContainEqual(["Location", "All locations"]);
  });

  it("exports Profitability with the six expense categories alongside each order", () => {
    const [sheet] = profitabilitySheets([
      { orderNumber: "ORD-1", customerName: "Asha", eventTypeName: "Wedding", eventStartDate: new Date("2026-10-13"), venue: "Hall", expenseCount: 2, revenue: 20000, totalCost: 10000, profit: 10000, marginPercent: 50, foodCostPercent: 35, byCategory: { FOOD: 7000, LABOUR: 3000, TRANSPORT: 0, EQUIPMENT: 0, VENUE: 0, MISC: 0 } },
    ]);
    expect(sheet.columns.slice(-6)).toEqual(["Food (₹)", "Labour (₹)", "Transport (₹)", "Equipment (₹)", "Venue (₹)", "Miscellaneous (₹)"]);
    expect(sheet.rows[0].slice(0, 4)).toEqual(["ORD-1", "Asha", "Wedding", "2026-10-13"]);
    expect(sheet.rows[0].slice(5, 10)).toEqual([20000, 10000, 10000, 50, 35]);
  });

  it("exports expenses with order or company, method, repeat and receipt names", () => {
    const [sheet] = expensesSheets([
      { id: "e1", orderId: "o1", orderNumber: "ORD-1", customerName: "Asha", category: "FOOD", amount: 7000, spentAt: new Date("2026-10-03"), paymentMethod: "BANK_TRANSFER", supplierName: "Fresh Mart", supplierId: null, notes: "Veg", recurringExpenseId: null, recurring: null, attachments: [{ id: "a", fileName: "bill.pdf", url: "/x", contentType: "application/pdf" }] },
      { id: "e2", orderId: null, orderNumber: null, customerName: null, category: "RENT", amount: 25000, spentAt: new Date("2026-10-01"), paymentMethod: null, supplierName: null, supplierId: null, notes: null, recurringExpenseId: "r", recurring: { frequency: "MONTHLY", isActive: true, startDate: new Date("2026-07-01"), endDate: null, nextDue: null }, attachments: [] },
    ]);
    expect(col(sheet, "Applies to")).toEqual(["Order", "Company"]);
    expect(col(sheet, "Category")).toEqual(["Food", "Rent"]);
    expect(col(sheet, "Payment method")).toEqual(["bank transfer", null]);
    expect(col(sheet, "Repeats")).toEqual([null, "monthly"]);
    expect(col(sheet, "Receipts")).toEqual(["bill.pdf", null]);
  });

  it("exports the audit log in India time with each change as text", () => {
    const [sheet] = auditSheets([{ id: "1", createdAt: new Date("2026-10-04T10:00:00Z"), who: "Anoop", summary: "Order updated", action: "order.update", recordType: "Order", recordId: "abc", href: null, changes: [{ field: "Status", before: "Pending", after: "Approved" }] }]);
    expect(sheet.rows[0]).toEqual(["4 Oct 2026, 3:30 pm", "Anoop", "Order updated", "order.update", "Order", "abc", "Status: Pending -> Approved"]);
  });

  it("exports the Subscriptions report and survives a CSV round trip", () => {
    const report = computeSaas({ payments: [], trials: [], failedPayments: 0, period: { from: null, to: null }, now: new Date("2026-02-15T10:00:00Z") });
    const sheets = saasSheets(report);
    expect(sheets.map((s) => s.title)).toEqual(["Subscriptions summary", "MRR by plan", "Revenue by plan", "Revenue by month"]);
    expect(sheets[0].rows.find((r) => r[0] === "MRR today, before GST (₹)")).toEqual(["MRR today, before GST (₹)", 0]);
    expect(toCsv(sheets)).toContain('"MRR today, before GST (₹)",0');
  });
});
