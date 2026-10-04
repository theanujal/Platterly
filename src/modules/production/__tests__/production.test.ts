import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem, recordStockTransaction } from "@/modules/inventory/inventory";
import { saveRecipe } from "@/modules/recipes/recipe";
import { getOrderStockPlan, takeOrderStock, getProductionPlan, StockTakeError } from "@/modules/production/production";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.recipe.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.customer.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.menuItem.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.inventory.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  orgIds.length = 0;
  userIds.length = 0;
});

/** 100 guests, default 10% extra = 110 servings. Paneer recipe: 2 kg per 10 servings = 22 kg. */
async function setup(stock: number, guests: number | null = 100, eventDate: Date = new Date()) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Prod Org", slug: `prod-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Asha", phone: "9876543210" }, actor.id);
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, actor.id, stock);
  const dish = await createMenuItem(org.id, { name: "Paneer Masala", foodType: "VEGETARIAN", price: 100 }, actor.id);
  const plain = await createMenuItem(org.id, { name: "Salad", foodType: "VEGETARIAN", price: 10 }, actor.id);
  await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] }, actor.id);
  const order = await createOrder(
    org.id,
    {
      customerId: customer.id,
      eventStartDate: eventDate,
      eventEndDate: eventDate,
      totalParticipants: guests ?? undefined,
      mealPlanEntries: [{ date: eventDate, mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: dish.id, quantity: 1 }, { itemType: "MENU_ITEM", catalogId: plain.id, quantity: 1 }] }],
    },
    actor.id,
  );
  return { org, actor, paneer, order };
}

const sendToKitchen = (orderId: string) => prisma.order.update({ where: { id: orderId }, data: { status: "SENT_TO_KITCHEN" } });

describe("Production planning and stock take (Chunk 18.4)", () => {
  it("works out the need from guests + extra percentage through the recipe, and lists dishes without a recipe", async () => {
    const { org, order } = await setup(50);
    const plan = await getOrderStockPlan(org.id, order.id);
    expect(plan?.servings).toBe(110);
    expect(plan?.lines).toHaveLength(1);
    expect(plan?.lines[0]).toMatchObject({ name: "Paneer", needed: 22, inStock: 50, short: 0 });
    expect(plan?.withoutRecipe).toEqual(["Salad"]);
    expect(plan?.canTake).toBe(false); // not sent to the kitchen yet
  });

  it("refuses to take stock before the order is with the kitchen", async () => {
    const { org, actor, order } = await setup(50);
    await expect(takeOrderStock(org.id, order.id, actor.id)).rejects.toBeInstanceOf(StockTakeError);
  });

  it("takes the stock once: ledger row tagged with the order, balance down, second attempt refused", async () => {
    const { org, actor, order, paneer } = await setup(50);
    await sendToKitchen(order.id);
    expect((await getOrderStockPlan(org.id, order.id))?.canTake).toBe(true);
    const result = await takeOrderStock(org.id, order.id, actor.id);
    expect(result.shortages).toEqual([]);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: paneer.id } })).stockCount)).toBe(28);
    const rows = await prisma.inventoryTransaction.findMany({ where: { orderId: order.id } });
    expect(rows.map((r) => [r.type, Number(r.quantity)])).toEqual([["STOCK_OUT", 22]]);
    await expect(takeOrderStock(org.id, order.id, actor.id)).rejects.toBeInstanceOf(StockTakeError);
    const after = await getOrderStockPlan(org.id, order.id);
    expect(after?.deductedAt).not.toBeNull();
    expect(after?.canTake).toBe(false);
    expect(after?.taken[0]).toMatchObject({ name: "Paneer", quantity: 22 });
  });

  it("two people confirming at once take the stock only once", async () => {
    const { org, actor, order, paneer } = await setup(50);
    await sendToKitchen(order.id);
    const results = await Promise.allSettled([takeOrderStock(org.id, order.id, actor.id), takeOrderStock(org.id, order.id, actor.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: paneer.id } })).stockCount)).toBe(28);
  });

  it("when stock is short it takes what is there (never below zero) and writes the shortfall", async () => {
    const { org, actor, order, paneer } = await setup(10);
    await sendToKitchen(order.id);
    const result = await takeOrderStock(org.id, order.id, actor.id);
    expect(result.shortages).toEqual([{ name: "Paneer", short: 12 }]);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: paneer.id } })).stockCount)).toBe(0);
    const row = await prisma.inventoryTransaction.findFirstOrThrow({ where: { orderId: order.id } });
    expect(Number(row.quantity)).toBe(10);
    expect(row.note).toContain("short by 12");
  });

  it("needs the guest count", async () => {
    const { org, actor, order } = await setup(50, null);
    await sendToKitchen(order.id);
    await expect(takeOrderStock(org.id, order.id, actor.id)).rejects.toThrow(/guest count/);
  });

  it("another kitchen cannot read or take this order's stock", async () => {
    const a = await setup(50);
    const b = await setup(50);
    await sendToKitchen(a.order.id);
    expect(await getOrderStockPlan(b.org.id, a.order.id)).toBeNull();
    await expect(takeOrderStock(b.org.id, a.order.id, b.actor.id)).rejects.toThrow();
  });

  it("the production plan covers orders in the window and totals the shortfall of orders not yet taken", async () => {
    const a = await setup(10);
    await sendToKitchen(a.order.id);
    const plan = await getProductionPlan(a.org.id);
    expect(plan.orders).toHaveLength(1);
    expect(plan.shortfalls).toEqual([expect.objectContaining({ name: "Paneer", needed: 22, inStock: 10, short: 12 })]);
    expect(plan.missingRecipe).toEqual(["Salad"]);

    await recordStockTransaction(a.org.id, a.paneer.id, { type: "STOCK_IN", quantity: 20 }, a.actor.id);
    expect((await getProductionPlan(a.org.id)).shortfalls).toEqual([]);

    const far = await setup(10, 100, new Date(Date.now() + 30 * 86400000));
    await sendToKitchen(far.order.id);
    expect((await getProductionPlan(far.org.id)).orders).toHaveLength(0);
  });
});
