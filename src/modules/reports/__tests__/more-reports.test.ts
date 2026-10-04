import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { recordVisit, scrubOldVisits, ownVisitId } from "@/modules/storefront-visits/visits";
import { loadFinanceReport, loadInventoryReport, loadMenuReport, loadStorefrontReport } from "../more-reports";

/** Chunk 22: the loaders against the real database, with a second kitchen next door to prove nothing leaks across. */

let a = { org: "", user: "", slug: "", customer: "" };
let b = { org: "", user: "", slug: "", customer: "" };
const orgIds: string[] = [];
const userIds: string[] = [];
const none = { from: null, to: null };
const day = (iso: string) => new Date(iso);

async function seed(label: string) {
  const slug = `mr-${label}-${crypto.randomUUID().slice(0, 6)}`;
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: `More Reports ${label}`, slug, slugChangeCount: 1, createdAt: new Date() } });
  const user = await prisma.user.create({ data: { id: crypto.randomUUID(), name: label, email: `mr-${label}-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  orgIds.push(org.id);
  userIds.push(user.id);
  const customer = await createCustomer(org.id, { name: `Customer ${label}`, phone: `98765${label === "a" ? "10001" : "10002"}` }, user.id);
  return { org: org.id, user: user.id, slug, customer: customer.id };
}

const headers = (ip: string, ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1", extra: Record<string, string> = {}) => new Headers({ "x-forwarded-for": ip, "user-agent": ua, host: "catering.localhost", ...extra });

beforeAll(async () => {
  a = await seed("a");
  b = await seed("b");

  // --- menu: one order for A with a Menu Type and two dishes ---
  const menu = await prisma.menu.create({ data: { organizationId: a.org, name: "Gold Menu", menuType: "VEGETARIAN", pricePerPlate: 500 } });
  const paneer = await prisma.menuItem.create({ data: { organizationId: a.org, name: "Paneer Tikka", foodType: "VEGETARIAN", price: 0 } });
  const dal = await prisma.menuItem.create({ data: { organizationId: a.org, name: "Dal Makhani", foodType: "VEGETARIAN", price: 0 } });
  await prisma.menuItem.create({ data: { organizationId: a.org, name: "Gulab Jamun", foodType: "VEGETARIAN", price: 0 } });
  const order = await createOrder(a.org, { customerId: a.customer, eventStartDate: day("2027-01-10"), eventEndDate: day("2027-01-10"), totalParticipants: 50, individualPricingEnabled: true, mealPlanEntries: [{ date: day("2027-01-10"), mealType: "DINNER", price: 4000 }] } as never, a.user);
  const entry = await prisma.mealPlanEntry.findFirstOrThrow({ where: { orderId: order.id } });
  await prisma.mealPlanEntry.update({ where: { id: entry.id }, data: { menuId: menu.id } });
  for (const item of [paneer, dal]) await prisma.orderItem.create({ data: { orderId: order.id, mealPlanEntryId: entry.id, itemType: "MENU_ITEM", menuItemId: item.id, name: item.name, unitPrice: 0 } });
  await prisma.order.update({ where: { id: order.id }, data: { balance: 1500 } });
  // B has its own, much bigger order and balance that must never show up in A's reports.
  const bOrder = await createOrder(b.org, { customerId: b.customer, eventStartDate: day("2027-01-12"), eventEndDate: day("2027-01-12"), totalParticipants: 10, individualPricingEnabled: true, mealPlanEntries: [{ date: day("2027-01-12"), mealType: "DINNER", price: 99999 }] } as never, b.user);
  await prisma.order.update({ where: { id: bOrder.id }, data: { balance: 88888 } });

  // --- inventory, purchases, payables, expenses ---
  const rice = await prisma.inventory.create({ data: { organizationId: a.org, name: "Rice", category: "Grains", unit: "kg", stockCount: 10, costPerUnit: 60, lowStockThreshold: 20 } });
  await prisma.inventory.create({ data: { organizationId: b.org, name: "B Saffron", category: "Spices", unit: "g", stockCount: 1000, costPerUnit: 500 } });
  await prisma.inventoryTransaction.create({ data: { inventoryId: rice.id, type: "STOCK_IN", quantity: 10 } });
  await prisma.inventoryTransaction.create({ data: { inventoryId: rice.id, type: "STOCK_OUT", quantity: 2, orderId: order.id } });
  const supplier = await prisma.supplier.create({ data: { organizationId: a.org, name: "Anna Traders" } });
  const po = await prisma.purchaseOrder.create({ data: { organizationId: a.org, number: "PO-1", supplierId: supplier.id, status: "RECEIVED", orderedAt: new Date(), receivedAt: new Date() } });
  await prisma.purchaseOrderItem.create({ data: { purchaseOrderId: po.id, inventoryId: rice.id, quantity: 10, receivedQuantity: 10, unitCost: 100 } });
  await prisma.supplierPayment.create({ data: { organizationId: a.org, supplierId: supplier.id, amount: 400, paidAt: new Date() } });
  await prisma.expense.create({ data: { organizationId: a.org, category: "RENT", amount: 700, spentAt: day("2027-01-05") } });
  await prisma.expense.create({ data: { organizationId: b.org, category: "RENT", amount: 55555, spentAt: day("2027-01-05") } });

  // --- storefront: a WhatsApp visit that became an order, a Google visit that only started, one bot, one for B ---
  const whatsapp = await recordVisit({ slug: a.slug, src: "whatsapp", referrer: null }, headers("203.0.113.1"));
  await recordVisit({ slug: a.slug, referrer: "https://www.google.com/" }, headers("203.0.113.2"));
  await recordVisit({ slug: b.slug, referrer: "https://www.google.com/" }, headers("203.0.113.3"));
  await prisma.storefrontDraft.create({ data: { organizationId: a.org, customerId: a.customer, data: {}, status: "COMPLETED", currentStep: 3, orderId: order.id, visitId: whatsapp } });
});

afterAll(async () => {
  await prisma.storefrontDraft.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.supplierPayment.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
});

describe("Menu report", () => {
  it("counts this kitchen's dishes and Menu Types, lists the never-picked dish, ignores the other kitchen", async () => {
    const menu = await loadMenuReport({ organizationId: a.org }, none);
    expect(menu.ordersCounted).toBe(1);
    expect(menu.mostSelected.map((d) => d.name).sort()).toEqual(["Dal Makhani", "Paneer Tikka"]);
    expect(menu.neverPicked.names).toEqual(["Gulab Jamun"]);
    expect(menu.menuTypes).toMatchObject([{ name: "Gold Menu", orders: 1 }]);
    expect(menu.menuTypes[0].revenue).toBe(4000);
  });
});

describe("Inventory report", () => {
  it("values this kitchen's stock, finds low stock, totals movements and purchases", async () => {
    const r = await loadInventoryReport({ organizationId: a.org }, none);
    expect(r.stock.totalValue).toBe(600);
    expect(r.stock.lowStock.map((i) => i.name)).toEqual(["Rice"]);
    expect(r.movements).toMatchObject({ movements: 2, stockInValue: 600, stockOutValue: 120, takenForOrders: 1 });
    expect(r.purchases).toMatchObject({ orderedValue: 1000, receivedValue: 1000, stillToReceive: 0, orders: 1 });
    expect(r.purchases.bySupplier[0].supplierName).toBe("Anna Traders");
  });
  it("the Super Admin view adds every kitchen", async () => {
    const all = await loadInventoryReport({ all: true }, none);
    expect(all.stock.totalValue).toBeGreaterThanOrEqual(600 + 500000);
  });
});

describe("Finance report", () => {
  it("revenue, expenses and profit for this kitchen only", async () => {
    const f = await loadFinanceReport({ organizationId: a.org }, none);
    expect(f.finance).toMatchObject({ revenue: 4000, expenses: 700, profit: 3300 });
  });
  it("receivables show only this kitchen's balance; payables are what was received minus what was paid", async () => {
    const f = await loadFinanceReport({ organizationId: a.org }, none);
    expect(f.receivables.total).toBe(1500);
    expect(f.receivables.biggest.map((o) => o.customerName)).toEqual(["Customer a"]);
    expect(f.payables.total).toBe(600);
    expect(f.payables.suppliers[0]).toMatchObject({ supplierName: "Anna Traders", outstanding: 600 });
  });
  it("the date range limits revenue and expenses but not receivables", async () => {
    const f = await loadFinanceReport({ organizationId: a.org }, { from: day("2000-01-01"), to: day("2000-01-31") });
    expect(f.finance).toMatchObject({ revenue: 0, expenses: 0 });
    expect(f.receivables.total).toBe(1500);
  });
});

describe("Storefront report", () => {
  it("counts this kitchen's visits by source, credits the order to the WhatsApp visit, and splits orders by channel", async () => {
    const r = await loadStorefrontReport({ organizationId: a.org }, none, { recent: true });
    expect(r.storefront.visits).toBe(2);
    expect(r.storefront.bySource.map((s) => s.source).sort()).toEqual(["GOOGLE", "WHATSAPP"]);
    expect(r.storefront.funnel.find((f) => f.label === "WhatsApp")).toMatchObject({ visits: 1, started: 1, submitted: 1, conversionPercent: 100 });
    expect(r.storefront.funnel.find((f) => f.label === "Google")).toMatchObject({ submitted: 0 });
    expect(r.channels.find((c) => c.channel === "STOREFRONT")).toMatchObject({ orders: 1, revenue: 4000 });
    expect(r.recent.map((v) => v.ipAddress).sort()).toEqual(["203.0.113.1", "203.0.113.2"]);
  });
  it("without the recent flag no IP address is loaded at all", async () => {
    expect((await loadStorefrontReport({ organizationId: a.org }, none)).recent).toEqual([]);
  });
});

describe("recording a visit", () => {
  it("ignores bots and unpublished or unknown kitchens", async () => {
    expect(await recordVisit({ slug: a.slug }, headers("203.0.113.9", "Googlebot/2.1"))).toBeNull();
    expect(await recordVisit({ slug: "no-such-kitchen" }, headers("203.0.113.9"))).toBeNull();
    await prisma.organization.update({ where: { id: b.org }, data: { slugChangeCount: 0 } });
    expect(await recordVisit({ slug: b.slug }, headers("203.0.113.9"))).toBeNull();
    await prisma.organization.update({ where: { id: b.org }, data: { slugChangeCount: 1 } });
  });
  it("a reload a moment later is the same visit; another source is a new one", async () => {
    const first = await recordVisit({ slug: a.slug, referrer: "https://blog.example/post" }, headers("203.0.113.20"));
    const again = await recordVisit({ slug: a.slug, referrer: "https://blog.example/post" }, headers("203.0.113.20"));
    expect(again).toBe(first);
    const other = await recordVisit({ slug: a.slug, src: "email" }, headers("203.0.113.20"));
    expect(other).not.toBe(first);
  });
  it("five reports at the same instant from one visitor make one visit, not five", async () => {
    const ids = await Promise.all(Array.from({ length: 5 }, () => recordVisit({ slug: a.slug, src: "facebook" }, headers("203.0.113.55"))));
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.storefrontVisit.count({ where: { organizationId: a.org, ipAddress: "203.0.113.55" } })).toBe(1);
  });
  it("keeps the IP, the Cloudflare location and the embedding website", async () => {
    const id = await recordVisit({ slug: a.slug, embedded: true, ancestor: "https://www.abc-caterer.com" }, headers("203.0.113.30", undefined, { "cf-ipcountry": "IN", "cf-ipcity": "Mysuru" }));
    expect(await prisma.storefrontVisit.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({ source: "EMBED", sourceDetail: "abc-caterer.com", ipAddress: "203.0.113.30", country: "IN", city: "Mysuru", device: "MOBILE" });
  });
  it("a visit id is only trusted for the kitchen it belongs to", async () => {
    const visit = await prisma.storefrontVisit.findFirstOrThrow({ where: { organizationId: a.org } });
    expect(await ownVisitId(a.org, visit.id)).toBe(visit.id);
    expect(await ownVisitId(b.org, visit.id)).toBeNull();
    expect(await ownVisitId(a.org, "x".repeat(60))).toBeNull();
    expect(await ownVisitId(a.org, 123)).toBeNull();
  });
  it("after 90 days the IP, city and browser string are blanked and the totals stay", async () => {
    const old = await prisma.storefrontVisit.create({ data: { organizationId: a.org, visitedAt: new Date(Date.now() - 100 * 86400000), source: "GOOGLE", device: "DESKTOP", browser: "Chrome", country: "IN", city: "Pune", ipAddress: "198.51.100.77", userAgent: "UA", visitorKey: "oldkey" } });
    const fresh = await prisma.storefrontVisit.findFirstOrThrow({ where: { organizationId: a.org, ipAddress: "203.0.113.30" } });
    expect(await scrubOldVisits()).toBeGreaterThanOrEqual(1);
    expect(await prisma.storefrontVisit.findUniqueOrThrow({ where: { id: old.id } })).toMatchObject({ ipAddress: null, city: null, userAgent: null, source: "GOOGLE", country: "IN", visitorKey: "oldkey" });
    expect((await prisma.storefrontVisit.findUniqueOrThrow({ where: { id: fresh.id } })).ipAddress).toBe("203.0.113.30");
    expect(await scrubOldVisits()).toBe(0);
  });
});

describe("the /api/visit beacon", () => {
  it("records a visit and answers its id; garbage, a bot, or an unknown kitchen answers null, never an error", async () => {
    const { POST } = await import("@/app/api/visit/route");
    const call = (body: unknown, h: Headers = headers("203.0.113.40")) => POST(new Request("http://catering.localhost/api/visit", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: h }));
    const ok = await (await call({ slug: a.slug, src: "instagram", referrer: "", embedded: false })).json();
    expect(typeof ok.visitId).toBe("string");
    expect((await prisma.storefrontVisit.findUniqueOrThrow({ where: { id: ok.visitId } })).source).toBe("INSTAGRAM");
    expect(await (await call("not json")).json()).toEqual({ visitId: null });
    expect(await (await call({ slug: 42 })).json()).toEqual({ visitId: null });
    expect(await (await call({ slug: "no-such-kitchen" })).json()).toEqual({ visitId: null });
    expect(await (await call({ slug: a.slug }, headers("203.0.113.41", "Googlebot/2.1"))).json()).toEqual({ visitId: null });
  });
  it("is rate limited per address: the 61st call in an hour records nothing", async () => {
    const { POST } = await import("@/app/api/visit/route");
    const results: (string | null)[] = [];
    for (let i = 0; i < 61; i += 1) {
      const res = await POST(new Request("http://catering.localhost/api/visit", { method: "POST", body: JSON.stringify({ slug: a.slug, src: "email" }), headers: headers("203.0.113.99") }));
      results.push((await res.json()).visitId);
    }
    expect(results.slice(0, 60).every((id) => typeof id === "string")).toBe(true);
    expect(results[60]).toBeNull();
  });
});
