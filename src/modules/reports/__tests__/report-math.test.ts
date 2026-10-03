import { describe, it, expect } from "vitest";
import { computeEvents, computeKitchens, computeSales, monthKey, monthLabel, type ReportOrder } from "../report-math";

const order = (patch: Partial<ReportOrder> & { id: string }): ReportOrder => ({
  orderNumber: patch.id,
  customerName: "Asha",
  status: "APPROVED",
  total: 1000,
  createdAt: new Date("2026-10-05T10:00:00Z"),
  eventStartDate: new Date("2026-11-10"),
  guests: 50,
  eventType: "Wedding",
  ...patch,
});

describe("computeSales", () => {
  const orders = [
    order({ id: "a", total: 10000, status: "COMPLETED" }),
    order({ id: "b", total: 5000, status: "PENDING_REVIEW" }),
    order({ id: "c", total: 20000, status: "CANCELLED" }), // never counts
    order({ id: "d", total: 6000, status: "SENT_TO_KITCHEN" }),
  ];
  const customers = [
    { createdAt: new Date(), hasOrder: true },
    { createdAt: new Date(), hasOrder: false },
    { createdAt: new Date(), hasOrder: true },
    { createdAt: new Date(), hasOrder: false },
  ];
  const quotations = [
    { total: 1000, status: "DRAFT" as const }, // not sent yet
    { total: 4000, status: "SENT" as const },
    { total: 6000, status: "ACCEPTED" as const },
    { total: 2000, status: "REJECTED" as const },
  ];
  const sales = computeSales(orders, customers, quotations);

  it("revenue is the order totals, leaving out cancelled orders", () => {
    expect(sales.revenue).toBe(21000);
    expect(sales.orders).toBe(3);
    expect(sales.averageOrderValue).toBe(7000);
  });

  it("confirmed order value counts only Approved, Sent to Kitchen and Completed", () => {
    expect(sales.confirmedOrders).toBe(2);
    expect(sales.confirmedOrderValue).toBe(16000);
  });

  it("conversion is the share of enquiries that placed an order", () => {
    expect(sales.enquiries).toBe(4);
    expect(sales.converted).toBe(2);
    expect(sales.conversionRate).toBe(50);
  });

  it("quotation value counts what was sent, not drafts; accepted value is separate", () => {
    expect(sales.quotationsSent).toBe(3);
    expect(sales.quotationValue).toBe(12000);
    expect(sales.acceptedQuotationValue).toBe(6000);
  });

  it("an empty period gives zeros and dashes (never NaN or divide-by-zero)", () => {
    const empty = computeSales([], [], []);
    expect(empty).toMatchObject({ revenue: 0, orders: 0, averageOrderValue: null, enquiries: 0, conversionRate: null, quotationValue: 0 });
    expect(empty.revenueByMonth).toEqual([]);
  });

  it("rounds money to paise", () => {
    expect(computeSales([order({ id: "x", total: 0.1 }), order({ id: "y", total: 0.2 })], [], []).revenue).toBe(0.3);
  });

  it("revenue by month is bucketed in India time, oldest first", () => {
    // 19:00 UTC on 31 Oct is 00:30 on 1 Nov in India.
    const rows = computeSales([order({ id: "1", createdAt: new Date("2026-10-31T19:00:00Z"), total: 100 }), order({ id: "2", createdAt: new Date("2026-10-05T10:00:00Z"), total: 50 }), order({ id: "3", createdAt: new Date("2026-09-30T20:00:00Z"), total: 25 })], [], []).revenueByMonth;
    expect(rows.map((r) => [r.month, r.revenue])).toEqual([["2026-10", 75], ["2026-11", 100]]);
  });
});

describe("computeEvents", () => {
  const orders = [
    order({ id: "a", total: 9000, guests: 100, eventType: "Wedding", eventStartDate: new Date("2026-11-10") }),
    order({ id: "b", total: 3000, guests: 40, eventType: "Birthday", eventStartDate: new Date("2026-11-20") }),
    order({ id: "c", total: 6000, guests: null, eventType: null, eventStartDate: new Date("2026-12-01") }),
    order({ id: "d", total: 8000, guests: 80, eventType: "Wedding", eventStartDate: new Date("2026-12-05"), status: "CANCELLED" }),
  ];
  const events = computeEvents(orders);

  it("counts events, guests and the average guests (only events that have a guest count)", () => {
    expect(events.events).toBe(3);
    expect(events.guests).toBe(140);
    expect(events.averageGuests).toBe(70);
    expect(events.revenue).toBe(18000);
  });

  it("groups by event month (the event's own calendar date) and by type, biggest revenue first", () => {
    expect(events.byMonth.map((m) => [m.month, m.count, m.revenue])).toEqual([["2026-11", 2, 12000], ["2026-12", 1, 6000]]);
    expect(events.byType.map((t) => [t.name, t.count, t.revenue])).toEqual([["Wedding", 1, 9000], ["No event type", 1, 6000], ["Birthday", 1, 3000]]);
  });

  it("lists the biggest events first, capped", () => {
    expect(events.topEvents.map((o) => o.id)).toEqual(["a", "c", "b"]);
    expect(computeEvents(orders, 2).topEvents).toHaveLength(2);
  });

  it("nothing in the period gives zeros", () => {
    expect(computeEvents([])).toMatchObject({ events: 0, guests: 0, averageGuests: null, revenue: 0, byMonth: [], byType: [], topEvents: [] });
  });
});

describe("computeKitchens (platform view)", () => {
  it("ranks kitchens by revenue and leaves out cancelled orders", () => {
    const rows = computeKitchens([
      order({ id: "1", kitchenId: "k1", kitchenName: "Spice Route", total: 5000 }),
      order({ id: "2", kitchenId: "k2", kitchenName: "Royal Feast", total: 9000, guests: 10 }),
      order({ id: "3", kitchenId: "k2", kitchenName: "Royal Feast", total: 1000, guests: 30 }),
      order({ id: "4", kitchenId: "k1", kitchenName: "Spice Route", total: 99999, status: "CANCELLED" }),
    ]);
    expect(rows.map((r) => [r.kitchenName, r.orders, r.revenue, r.averageOrderValue, r.guests])).toEqual([
      ["Royal Feast", 2, 10000, 5000, 40],
      ["Spice Route", 1, 5000, 5000, 50],
    ]);
  });
});

describe("month helpers", () => {
  it("keys and labels months", () => {
    expect(monthKey(new Date("2026-03-31T20:00:00Z"), "utc")).toBe("2026-03");
    expect(monthKey(new Date("2026-03-31T20:00:00Z"), "ist")).toBe("2026-04");
    expect(monthLabel("2026-10")).toBe("Oct 2026");
  });
});
