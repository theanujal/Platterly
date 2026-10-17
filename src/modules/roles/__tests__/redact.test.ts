import { describe, it, expect } from "vitest";
import { menuOptionsFor, pickerWithoutPrices } from "../redact";
import { snapshotWithoutPrices } from "@/modules/menu-approvals/review-data";
import { redactDashboardSnapshot, type DashboardSnapshot } from "@/app/(app)/dashboard/_data";
import { withoutMoneyFigures, type AuditEntry } from "@/modules/audit/audit-log";
import { allowedReportTabs } from "@/modules/reports/tabs";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import type { MenuPickerData } from "@/modules/menus/menu";

/**
 * Redaction happens on the server before anything is handed to a page, a download or a client component. These tests walk the
 * result looking for any number that could be a price, so a nested value cannot slip through.
 */
function numbersIn(value: unknown, path = "", out: [string, number][] = []): [string, number][] {
  if (typeof value === "number") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => numbersIn(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) numbersIn(v, `${path}.${k}`, out);
  return out;
}

describe("menuOptionsFor", () => {
  const menus = [{ id: "m1", name: "Gold", menuType: "VEGETARIAN" as const, pricePerPlate: "450.00", childUnder5Chargeable: true, childUnder5Price: "200", child5To10PricingType: "PERCENTAGE" as const, child5To10PriceValue: "50" }];
  it("keeps the real prices for someone who may see them", () => {
    expect(menuOptionsFor(menus, true)[0]).toMatchObject({ price: 450, childUnder5Price: 200, child5To10PriceValue: 50 });
  });
  it("sends no price at all otherwise: names and rules stay, every figure is 0 or null", () => {
    const out = menuOptionsFor(menus, false)[0];
    expect(out).toMatchObject({ id: "m1", name: "Gold", menuType: "VEGETARIAN", childUnder5Chargeable: true, child5To10PricingType: "PERCENTAGE", price: 0, childUnder5Price: null, child5To10PriceValue: null });
  });
});

describe("pickerWithoutPrices", () => {
  const picker: MenuPickerData = {
    id: "m1",
    name: "Gold",
    description: null,
    image: null,
    sections: [{ categoryId: "c1", categoryName: "Starters", maxSelection: 2, items: [{ id: "i1", name: "Paneer", price: 120, image: null, foodType: "VEGETARIAN" }] }],
    addOns: [{ id: "a1", name: "Live counter", description: null, image: null, price: 5000, priceType: "FIXED", included: false }],
  };
  it("zeroes every dish and add-on price at any depth and leaves the names", () => {
    const out = pickerWithoutPrices(picker);
    expect(numbersIn(out).filter(([, n]) => n !== 0 && !String(n).startsWith("2"))).toEqual([]);
    expect(out.sections[0].items[0]).toMatchObject({ name: "Paneer", price: 0 });
    expect(out.addOns[0]).toMatchObject({ name: "Live counter", price: 0, priceType: "FIXED" });
    expect(JSON.stringify(out)).not.toContain("120");
    expect(JSON.stringify(out)).not.toContain("5000");
  });
});

describe("snapshotWithoutPrices", () => {
  const snapshot = {
    customerName: "A",
    eventTypeName: "Wedding",
    eventStartDate: "2026-12-01",
    eventEndDate: "2026-12-01",
    venue: null,
    guests: 100,
    total: 99999,
    meals: [{ date: "2026-12-01", mealType: "LUNCH", menuName: "Gold", price: 450, pricePerPlate: 450, items: [{ name: "Paneer", quantity: 1, unitPrice: 120 }] }],
    selectedItems: [],
    isCustomMenu: false,
    breakdown: { menuAmount: 45000, extrasAmount: 0, childrenCharge: 0, chargesAndDiscount: 0 },
  } as unknown as ApprovalSnapshot;
  it("removes the total, per-meal prices, item prices and the breakdown from a sent version", () => {
    const out = snapshotWithoutPrices(snapshot)!;
    expect(out.total).toBe(0);
    expect(out).not.toHaveProperty("breakdown");
    expect(out.meals[0].price).toBeNull();
    expect(out.meals[0].pricePerPlate).toBeNull();
    expect(out.meals[0].items[0]).not.toHaveProperty("unitPrice");
    expect(JSON.stringify(out)).not.toMatch(/99999|45000|120|450/);
    expect(out.meals[0].items[0].name).toBe("Paneer");
  });
  it("passes a missing snapshot through", () => expect(snapshotWithoutPrices(null)).toBeNull());
});

describe("redactDashboardSnapshot", () => {
  const row = { id: "o1", orderNumber: "ORD-1", customerName: "A", eventTypeName: null, eventStartDate: new Date(), eventEndDate: new Date(), guests: 10, total: 5000, advance: 1000, status: "APPROVED", paymentStatus: "PARTIALLY_PAID" } as const;
  const tab = { count: 1, rows: [row] };
  const snapshot = {
    outstandingBalance: 4000,
    outstandingOrdersCount: 1,
    overdue: { count: 1, amount: 4000, top: { customerName: "A", orderNumber: "ORD-1", balance: 4000 } },
    activity: [{ date: "2026-12-01", orders: 1, revenue: 5000, guests: 10 }],
    orderTabs: { today: tab, upcoming: tab, all: tab },
  } as unknown as DashboardSnapshot;

  it("hands everything back to someone who holds both rights", () => {
    expect(redactDashboardSnapshot(snapshot, { orderPrices: true, paymentDetails: true })).toBe(snapshot);
  });
  it("without either right no revenue, total, advance, balance or overdue amount remains anywhere in the snapshot", () => {
    const out = redactDashboardSnapshot(snapshot, { orderPrices: false, paymentDetails: false });
    expect(JSON.stringify(out)).not.toMatch(/5000|1000|4000/);
    expect(out.orderTabs.today.rows[0]).toMatchObject({ total: 0, advance: 0, paymentStatus: "UNPAID" });
    expect(out.overdue).toEqual({ count: 0, amount: 0, top: null });
    expect(out.activity[0]).toMatchObject({ orders: 1, guests: 10, revenue: 0 }); // counts survive, money does not
  });
  it("order prices alone keep revenue and totals but not what is owed", () => {
    const out = redactDashboardSnapshot(snapshot, { orderPrices: true, paymentDetails: false });
    expect(out.activity[0].revenue).toBe(5000);
    expect(out.orderTabs.all.rows[0].total).toBe(5000);
    expect(out.outstandingBalance).toBe(0);
    expect(out.orderTabs.all.rows[0].advance).toBe(0);
  });
});

describe("withoutMoneyFigures (audit history)", () => {
  const entry = (field: string): AuditEntry => ({ id: "1", createdAt: new Date(), who: "A", summary: "x", action: "order.update", recordType: "Order", recordId: "o", href: null, changes: [{ field, before: "100", after: "200" }] });
  it("keeps who changed what and when, and hides the before and after of money fields only", () => {
    const [money, plain] = withoutMoneyFigures([entry("total"), entry("venue")]);
    expect(money.changes[0]).toEqual({ field: "total", before: "hidden", after: "hidden" });
    expect(plain.changes[0]).toEqual({ field: "venue", before: "100", after: "200" });
    for (const field of ["discount", "advance", "balance", "unitCost", "pricePerPlate", "amount", "transportationCost"]) {
      expect(withoutMoneyFigures([entry(field)])[0].changes[0].after, field).toBe("hidden");
    }
  });
});

describe("allowedReportTabs", () => {
  const none = { inventory: false, expenses: false, financialReports: false, supplierCosts: false };
  it("without financial reports only the Storefront tab (visits, no money) is left", () => {
    expect(allowedReportTabs({ ...none, inventory: true, expenses: true, supplierCosts: true })).toEqual(["inventory", "storefront"]);
    expect(allowedReportTabs(none)).toEqual(["storefront"]);
  });
  it("Sales, Events, Menu and Finance need financial reports; Inventory needs supplier costs", () => {
    expect(allowedReportTabs({ ...none, financialReports: true })).toEqual(["sales", "events", "menu", "storefront"]);
    expect(allowedReportTabs({ inventory: true, expenses: true, financialReports: true, supplierCosts: true })).toEqual(["sales", "events", "menu", "inventory", "finance", "storefront"]);
    expect(allowedReportTabs({ ...none, inventory: true })).not.toContain("inventory");
    expect(allowedReportTabs({ ...none, expenses: true })).not.toContain("finance");
  });
});
