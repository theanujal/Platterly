import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { ValidationError } from "@/lib/errors";
import { createCustomer, updateCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createQuotation } from "@/modules/quotations/quotation";
import { createExpense } from "@/modules/expenses/expense";
import { createMenuItem } from "@/modules/menus/item";
import { createMenu } from "@/modules/menus/menu";
import { createAddOn } from "@/modules/addons/addon";
import { createCategory } from "@/modules/menus/category";
import { createEventType } from "@/modules/events/event-type";
import { createInventoryItem } from "@/modules/inventory/inventory";

/**
 * Chunk 17.3 — input validation sweep. Every Server Action is callable with any values, so the modules refuse nonsense
 * themselves. Each case below was ACCEPTED before this sweep (negative prices and discounts, NaN guests, empty names,
 * 20,000-character text, bad phone and email, negative stock) and some crashed with a raw database error.
 */
let org = "";
let actor = "";
let customerId = "";
const day = new Date("2027-03-01");
const long = "x".repeat(20000);
const meals = [{ date: day, mealType: "DINNER" as const, price: 400 }];
const orderBase = { eventStartDate: day, eventEndDate: day, totalParticipants: 10, adultCount: 1, individualPricingEnabled: true, mealPlanEntries: meals };

beforeAll(async () => {
  const o = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Validation", slug: `val-${crypto.randomUUID().slice(0, 6)}`, createdAt: new Date() } });
  const u = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "V", email: `v-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  [org, actor] = [o.id, u.id];
  customerId = (await createCustomer(org, { name: "Asha", phone: "9876543210" }, actor)).id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: org } });
  await prisma.organization.delete({ where: { id: org } });
  await prisma.user.delete({ where: { id: actor } });
});

const cases: Array<[string, () => Promise<unknown>]> = [
  ["customer name 20,000 characters", () => createCustomer(org, { name: long, phone: "9876543211" }, actor)],
  ["customer empty name", () => createCustomer(org, { name: "   ", phone: "9876543211" }, actor)],
  ["customer phone 'abc'", () => createCustomer(org, { name: "B", phone: "abc" }, actor)],
  ["customer email 'not-an-email'", () => createCustomer(org, { name: "B", phone: "9876543212", email: "not-an-email" }, actor)],
  ["customer update with bad phone", () => updateCustomer(org, customerId, { name: "Asha", phone: "12" }, actor)],
  ["order negative discount", () => createOrder(org, { customerId, ...orderBase, discount: -500 } as never, actor)],
  ["order negative advance", () => createOrder(org, { customerId, ...orderBase, advance: -100 } as never, actor)],
  ["order negative meal price", () => createOrder(org, { customerId, ...orderBase, mealPlanEntries: [{ ...meals[0], price: -400 }] } as never, actor)],
  ["order NaN guests", () => createOrder(org, { customerId, ...orderBase, totalParticipants: NaN } as never, actor)],
  ["order absurd price", () => createOrder(org, { customerId, ...orderBase, mealPlanEntries: [{ ...meals[0], price: 1e15 }] } as never, actor)],
  ["order notes 20,000 characters", () => createOrder(org, { customerId, ...orderBase, notes: long } as never, actor)],
  ["quotation negative discount", () => createQuotation(org, { customerId, ...orderBase, discount: -500 } as never, actor)],
  ["expense absurd amount", () => createExpense(org, null, { category: "RENT", amount: 1e15, spentAt: day } as never, actor)],
  ["expense notes 20,000 characters", () => createExpense(org, null, { category: "RENT", amount: 5, spentAt: day, notes: long } as never, actor)],
  ["menu item negative price", () => createMenuItem(org, { name: "N", foodType: "VEGETARIAN", price: -5 }, actor)],
  ["menu item name 20,000 characters", () => createMenuItem(org, { name: long, foodType: "VEGETARIAN", price: 5 }, actor)],
  ["menu negative price", () => createMenu(org, { name: "M", menuType: "VEGETARIAN", pricePerPlate: -1 }, actor)],
  ["add-on negative price", () => createAddOn(org, { name: "A", type: "LIVE_COUNTER", priceType: "FIXED", price: -9 }, actor)],
  ["category empty name", () => createCategory(org, { name: "   " }, actor)],
  ["event type empty name", () => createEventType(org, { name: "" }, actor)],
  ["inventory negative opening stock", () => createInventoryItem(org, { name: "Neg", category: "G", unit: "kg" }, actor, -10)],
];

describe("hostile input is refused with a readable message and stores nothing", () => {
  it.each(cases)("%s", async (_name, call) => {
    await expect(call()).rejects.toBeInstanceOf(ValidationError);
  });

  it("nothing from the refused attempts was saved", async () => {
    expect(await prisma.customer.count({ where: { organizationId: org } })).toBe(1);
    expect(await prisma.order.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.quotation.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.expense.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.menuItem.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.menu.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.addOn.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.menuCategory.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.eventType.count({ where: { organizationId: org } })).toBe(0);
    expect(await prisma.inventory.count({ where: { organizationId: org } })).toBe(0);
  });

  it("ordinary, valid values still go through (including a script-looking name, which is stored as plain text)", async () => {
    const c = await createCustomer(org, { name: "<script>alert(1)</script>", phone: "98765 43213", email: "ok@example.test" }, actor);
    expect(c.name).toBe("<script>alert(1)</script>"); // shown escaped by React, never run
    const order = await createOrder(org, { customerId, ...orderBase, discount: 0, advance: 0 } as never, actor);
    expect(Number(order.total)).toBeGreaterThan(0);
  });
});
