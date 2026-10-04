import { describe, it, expect } from "vitest";
import { monthLabel } from "@/modules/reports/report-math";
import { computeMenuReport } from "@/modules/reports/menu-math";
import { computeMovements, computePurchases, computeStock } from "@/modules/reports/inventory-math";
import { computeFinance, computePayables, computeReceivables } from "@/modules/reports/finance-math";
import { computeChannels, computeStorefront, type VisitRow } from "@/modules/reports/storefront-math";

describe("menu report", () => {
  const paneer = { id: "i1", name: "Paneer Tikka", isExtra: false };
  const dal = { id: "i2", name: "Dal Makhani", isExtra: false };
  const orders = [
    { id: "o1", total: 1000, meals: [{ menuId: "m1", menuName: "Gold", dishes: [paneer, dal] }] },
    { id: "o2", total: 600, meals: [{ menuId: "m1", menuName: "Gold", dishes: [paneer] }] },
    // One order, two Menu Types: its total is shared, and a dish picked at both meals counts once for the order.
    { id: "o3", total: 400, meals: [{ menuId: "m1", menuName: "Gold", dishes: [{ ...paneer, isExtra: true }] }, { menuId: "m2", menuName: "Silver", dishes: [paneer] }] },
  ];
  const report = computeMenuReport(orders, [{ id: "i1", name: "Paneer Tikka", isActive: true }, { id: "i2", name: "Dal Makhani", isActive: true }, { id: "i3", name: "Gulab Jamun", isActive: true }, { id: "i4", name: "Old Dish", isActive: false }]);

  it("ranks dishes by the number of orders that picked them", () => {
    expect(report.mostSelected.map((d) => [d.name, d.orders])).toEqual([["Paneer Tikka", 3], ["Dal Makhani", 1]]);
    expect(report.mostSelected[0].asExtra).toBe(1);
    expect(report.leastSelected[0].name).toBe("Dal Makhani");
  });
  it("lists active dishes nobody picked, but not inactive ones", () => {
    expect(report.neverPicked).toEqual({ total: 1, names: ["Gulab Jamun"] });
  });
  it("shares a multi-menu order's total evenly so the revenue rows add up to the real revenue", () => {
    const gold = report.menuTypes.find((m) => m.menuId === "m1")!;
    const silver = report.menuTypes.find((m) => m.menuId === "m2")!;
    expect(gold.revenue).toBe(1000 + 600 + 200);
    expect(silver.revenue).toBe(200);
    expect(gold.revenue + silver.revenue).toBe(2000);
    expect(gold.orders).toBe(3);
    expect(gold.sharePercent + silver.sharePercent).toBeGreaterThanOrEqual(99);
  });
  it("an empty period is empty, not an error", () => {
    expect(computeMenuReport([], [])).toMatchObject({ ordersCounted: 0, mostSelected: [], menuTypes: [] });
  });
});

describe("inventory report", () => {
  const now = new Date("2026-10-04T10:00:00Z");
  const rows = [
    { id: "a", name: "Rice", category: "Grains", unit: "kg", stock: 10, costPerUnit: 60, lowStockThreshold: 20, expiryDate: new Date("2026-10-20T00:00:00Z") },
    { id: "b", name: "Oil", category: "Pantry", unit: "l", stock: 5, costPerUnit: null, lowStockThreshold: null, expiryDate: null },
    { id: "c", name: "Milk", category: "Dairy", unit: "l", stock: 4, costPerUnit: 50, lowStockThreshold: 2, expiryDate: new Date("2026-10-01T00:00:00Z") },
    { id: "d", name: "Salt", category: "Pantry", unit: "kg", stock: 0, costPerUnit: 20, lowStockThreshold: 1, expiryDate: new Date("2026-10-02T00:00:00Z") },
  ];
  const stock = computeStock(rows, now);
  it("values stock at cost, flags items with no cost, and groups by category", () => {
    expect(stock.totalValue).toBe(10 * 60 + 4 * 50);
    expect(stock.itemsWithoutCost).toBe(1);
    expect(stock.byCategory[0]).toEqual({ category: "Grains", items: 1, value: 600 });
  });
  it("low stock is at or below the alert level; expiry covers expired and the next 30 days, never an empty shelf", () => {
    expect(stock.lowStock.map((i) => i.name)).toEqual(["Salt", "Rice"]);
    expect(stock.expiring.map((i) => [i.name, i.daysLeft])).toEqual([["Milk", -3], ["Rice", 16]]);
  });
  it("movements total in, out and adjustments by value, and count what was taken for orders", () => {
    const m = computeMovements([
      { type: "STOCK_IN", quantity: 10, inventoryId: "a", name: "Rice", unit: "kg", costPerUnit: 60, forOrder: false },
      { type: "STOCK_OUT", quantity: 4, inventoryId: "a", name: "Rice", unit: "kg", costPerUnit: 60, forOrder: true },
      { type: "ADJUSTMENT", quantity: -1, inventoryId: "a", name: "Rice", unit: "kg", costPerUnit: 60, forOrder: false },
    ]);
    expect(m).toMatchObject({ movements: 3, stockInValue: 600, stockOutValue: 240, adjustmentValue: -60, takenForOrders: 1 });
    expect(m.busiest[0]).toMatchObject({ name: "Rice", moves: 3, inQty: 10, outQty: 5 });
  });
  it("purchases split ordered, received and still to arrive per supplier", () => {
    const p = computePurchases([
      { id: "p1", lines: [{ supplierId: "s1", supplierName: "Anna", quantity: 10, receivedQuantity: 10, unitCost: 100 }, { supplierId: "s1", supplierName: "Anna", quantity: 5, receivedQuantity: 0, unitCost: 40 }] },
      { id: "p2", lines: [{ supplierId: "s2", supplierName: "Bhat", quantity: 2, receivedQuantity: 1, unitCost: 500 }] },
    ]);
    expect(p).toMatchObject({ orderedValue: 1000 + 200 + 1000, receivedValue: 1000 + 500, stillToReceive: 700, orders: 2 });
    expect(p.bySupplier.map((s) => [s.supplierName, s.orders, s.orderedValue])).toEqual([["Anna", 1, 1200], ["Bhat", 1, 1000]]);
  });
});

describe("finance report", () => {
  it("revenue against expenses by month, with profit and margin; cancelled orders never count", () => {
    const f = computeFinance(
      [{ total: 1000, createdAt: new Date("2026-09-10T06:00:00Z"), status: "APPROVED" }, { total: 500, createdAt: new Date("2026-10-02T06:00:00Z"), status: "COMPLETED" }, { total: 9999, createdAt: new Date("2026-10-02T06:00:00Z"), status: "CANCELLED" }],
      [{ amount: 300, spentAt: new Date("2026-09-15T00:00:00Z"), category: "FOOD" }, { amount: 200, spentAt: new Date("2026-10-01T00:00:00Z"), category: "RENT" }],
    );
    expect(f).toMatchObject({ revenue: 1500, expenses: 500, profit: 1000, marginPercent: 66.7 });
    expect(f.months.map((m) => [m.label, m.revenue, m.expenses, m.profit])).toEqual([[monthLabel("2026-09"), 1000, 300, 700], [monthLabel("2026-10"), 500, 200, 300]]);
    expect(f.expensesByCategory[0]).toEqual({ category: "FOOD", label: "Food", amount: 300 });
  });
  it("margin is blank, not a divide-by-zero, when there is no revenue", () => {
    expect(computeFinance([], [{ amount: 50, spentAt: new Date("2026-10-01"), category: "MISC" }]).marginPercent).toBeNull();
  });
  it("receivables are aged from the event date: before it is not yet due, after it is days late", () => {
    const now = new Date("2026-10-31T10:00:00Z");
    const order = (id: string, eventDate: string, balance: number) => ({ id, orderNumber: id, customerName: id, eventDate: new Date(eventDate), balance });
    const r = computeReceivables([order("future", "2026-11-05", 100), order("late10", "2026-10-21", 200), order("late40", "2026-09-21", 300), order("late90", "2026-08-01", 400), order("paid", "2026-10-01", 0)], now);
    expect(r.total).toBe(1000);
    expect(r.orders).toBe(4);
    expect(r.buckets.map((b) => b.amount)).toEqual([100, 200, 300, 400]);
    expect(r.biggest[0].id).toBe("late90");
  });
  it("payables apply payments to the oldest receipts first, so what is left is the newest", () => {
    const now = new Date("2026-10-31T10:00:00Z");
    const p = computePayables(
      [
        { supplierId: "s1", supplierName: "Anna", received: [{ date: new Date("2026-06-01"), value: 1000 }, { date: new Date("2026-10-20"), value: 500 }], paid: 1200 },
        { supplierId: "s2", supplierName: "Settled", received: [{ date: new Date("2026-09-01"), value: 300 }], paid: 300 },
      ],
      now,
    );
    expect(p.total).toBe(300);
    expect(p.suppliers).toEqual([{ supplierId: "s1", supplierName: "Anna", outstanding: 300, oldestDays: 11 }]);
    expect(p.buckets.map((b) => b.amount)).toEqual([300, 0, 0, 0]);
  });
});

describe("storefront report", () => {
  const visit = (id: string, source: VisitRow["source"], key: string, extra: Partial<VisitRow> = {}): VisitRow => ({ id, visitedAt: new Date("2026-10-04T06:00:00Z"), source, sourceDetail: null, device: "MOBILE", browser: "Chrome", country: null, city: null, visitorKey: key, ...extra });
  const visits = [visit("v1", "WHATSAPP", "k1"), visit("v2", "WHATSAPP", "k2"), visit("v3", "GOOGLE", "k1"), visit("v4", "EMBED", "k3", { sourceDetail: "abc-caterer.com" }), visit("v5", "REFERRAL", "k4", { sourceDetail: "blog.example" })];
  const drafts = [
    { visitId: "v1", status: "COMPLETED" as const, currentStep: 3 },
    { visitId: "v2", status: "IN_PROGRESS" as const, currentStep: 2 },
    { visitId: "v3", status: "IN_PROGRESS" as const, currentStep: 3 },
    { visitId: null, status: "COMPLETED" as const, currentStep: 3 },
    { visitId: "gone", status: "IN_PROGRESS" as const, currentStep: 2 },
  ];
  const r = computeStorefront(visits, drafts, 30);

  it("counts visits and unique visitors (the same key twice is one visitor)", () => {
    expect(r.visits).toBe(5);
    expect(r.visitors).toBe(4);
    expect(r.bySource[0]).toMatchObject({ source: "WHATSAPP", visits: 2, visitors: 2, sharePercent: 40 });
  });
  it("credits each journey to its visit's source, with older journeys under 'Before tracking' and out-of-range visits skipped", () => {
    const whatsapp = r.funnel.find((f) => f.label === "WhatsApp")!;
    expect(whatsapp).toMatchObject({ visits: 2, started: 2, reachedReview: 1, submitted: 1, conversionPercent: 50 });
    expect(r.funnel.find((f) => f.label === "Before tracking")).toMatchObject({ started: 1, submitted: 1 });
    expect(r.started).toBe(4);
    expect(r.submitted).toBe(2);
  });
  it("lists embedding websites and other referrers, and uses daily bars for a short range, monthly for a long one", () => {
    expect(r.embedSites).toEqual([{ label: "abc-caterer.com", count: 1 }]);
    expect(r.referralSites).toEqual([{ label: "blog.example", count: 1 }]);
    expect(r.seriesUnit).toBe("day");
    expect(computeStorefront(visits, [], null).seriesUnit).toBe("month");
  });
  it("orders are split by the door they came through; cancelled ones are left out", () => {
    const rows = computeChannels([
      { fromStorefront: true, fromQuotation: false, total: 1000, status: "APPROVED" },
      { fromStorefront: false, fromQuotation: true, total: 500, status: "COMPLETED" },
      { fromStorefront: false, fromQuotation: false, total: 300, status: "APPROVED" },
      { fromStorefront: false, fromQuotation: false, total: 300, status: "CANCELLED" },
    ]);
    expect(rows.map((c) => [c.channel, c.orders, c.revenue])).toEqual([["STOREFRONT", 1, 1000], ["QUOTATION", 1, 500], ["TEAM", 1, 300]]);
    expect(rows.reduce((sum, c) => sum + c.sharePercent, 0)).toBeGreaterThanOrEqual(99);
  });
});
