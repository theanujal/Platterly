import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder, createEventForOrder } from "@/modules/orders/order";
import { createEventType } from "@/modules/events/event-type";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem, recordStockTransaction } from "@/modules/inventory/inventory";
import { saveRecipe } from "@/modules/recipes/recipe";
import { getOrderInventory, sendOrderItems, returnOrderItem, getProductionPlan, StockTakeError } from "@/modules/production/production";

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.recipe.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.event.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.order.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.eventType.deleteMany({ where: { organizationId: { in: orgIds } } });
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
const approve = (orderId: string) => prisma.order.update({ where: { id: orderId }, data: { status: "APPROVED" } });
const stockOf = async (id: string) => Number((await prisma.inventory.findUniqueOrThrow({ where: { id } })).stockCount);

describe("Production planning and stock take (Chunk 18.4)", () => {
  it("works out the need from guests + extra percentage through the recipe, and lists dishes without a recipe", async () => {
    const { org, order } = await setup(50);
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.servings).toBe(110);
    expect(plan?.lines).toHaveLength(1);
    expect(plan?.lines[0]).toMatchObject({ name: "Paneer", fromRecipes: 22, required: 22, sent: 0, remaining: 22, inStock: 50, short: 0 });
    expect(plan?.withoutRecipe).toEqual(["Salad"]);
    expect(plan?.canSend).toBe(false); // the customer has not approved the menu yet
    expect(plan?.blockedReason).toBe("Items can be set once the customer approves the menu.");
  });

  it("only sends items once the menu is approved", async () => {
    const { org, actor, order } = await setup(50);
    await expect(sendOrderItems(org.id, order.id, actor.id)).rejects.toBeInstanceOf(StockTakeError);
    await approve(order.id);
    expect((await getOrderInventory(org.id, order.id))?.canSend).toBe(true);
    await sendToKitchen(order.id);
    expect((await getOrderInventory(org.id, order.id))?.canSend).toBe(true);
  });

  it("sends the items: ledger row tagged with the order, balance down; a second click has nothing left to send", async () => {
    const { org, actor, order, paneer } = await setup(50);
    await approve(order.id);
    const result = await sendOrderItems(org.id, order.id, actor.id);
    expect(result.shortages).toEqual([]);
    expect(await stockOf(paneer.id)).toBe(28);
    const rows = await prisma.inventoryTransaction.findMany({ where: { orderId: order.id } });
    expect(rows.map((r) => [r.type, Number(r.quantity)])).toEqual([["STOCK_OUT", 22]]);
    await expect(sendOrderItems(org.id, order.id, actor.id)).rejects.toThrow(/has been sent/);
    const after = await getOrderInventory(org.id, order.id);
    expect(after?.lines[0]).toMatchObject({ sent: 22, remaining: 0 });
    expect(after?.deductedAt).not.toBeNull();
  });

  it("two people clicking at once send the items only once", async () => {
    const { org, actor, order, paneer } = await setup(50);
    await approve(order.id);
    const results = await Promise.allSettled([sendOrderItems(org.id, order.id, actor.id), sendOrderItems(org.id, order.id, actor.id)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await stockOf(paneer.id)).toBe(28);
  });

  it("when stock is short it sends what is there (never below zero), writes the shortfall, and a later send tops it up", async () => {
    const { org, actor, order, paneer } = await setup(10);
    await approve(order.id);
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.lines[0]).toMatchObject({ short: 12 });
    const result = await sendOrderItems(org.id, order.id, actor.id);
    expect(result.shortages).toEqual([{ name: "Paneer", short: 12 }]);
    expect(await stockOf(paneer.id)).toBe(0);
    const row = await prisma.inventoryTransaction.findFirstOrThrow({ where: { orderId: order.id } });
    expect(Number(row.quantity)).toBe(10);
    expect(row.note).toContain("short by 12");

    await recordStockTransaction(org.id, paneer.id, { type: "STOCK_IN", quantity: 30 }, actor.id);
    const topUp = await sendOrderItems(org.id, order.id, actor.id);
    expect(topUp.shortages).toEqual([]);
    expect((await getOrderInventory(org.id, order.id))?.lines[0]).toMatchObject({ sent: 22, remaining: 0 });
    expect(await stockOf(paneer.id)).toBe(18);
  });

  it("extra items added by hand are required and sent with the recipe items", async () => {
    const { org, actor, order } = await setup(50);
    const gas = await createInventoryItem(org.id, { name: "Gas cylinder", category: "Other", unit: "pcs" }, actor.id, 5);
    const type = await createEventType(org.id, { name: "Wedding" }, actor.id);
    await prisma.order.update({ where: { id: order.id }, data: { eventTypeId: type.id } });
    const event = await createEventForOrder(org.id, order.id, actor.id);
    await prisma.eventRequiredInventory.create({ data: { eventId: event.id, inventoryId: gas.id, quantity: 2 } });
    await approve(order.id);
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.lines.map((l) => [l.name, l.required])).toEqual([["Gas cylinder", 2], ["Paneer", 22]]);
    await sendOrderItems(org.id, order.id, actor.id);
    expect(await stockOf(gas.id)).toBe(3);
  });

  it("when the menu grows only the difference is sent, and when it shrinks the surplus can be returned", async () => {
    const { org, actor, order, paneer } = await setup(100);
    await approve(order.id);
    await sendOrderItems(org.id, order.id, actor.id);
    expect(await stockOf(paneer.id)).toBe(78);

    // More guests: 200 guests + 10% = 220 servings = 44 kg, 22 already sent.
    await prisma.order.update({ where: { id: order.id }, data: { totalParticipants: 200 } });
    const grown = await getOrderInventory(org.id, order.id);
    expect(grown?.lines[0]).toMatchObject({ required: 44, sent: 22, remaining: 22 });
    await sendOrderItems(org.id, order.id, actor.id);
    expect(await stockOf(paneer.id)).toBe(56);

    // Fewer guests: the surplus is shown, and undo puts back everything sent for the item.
    await prisma.order.update({ where: { id: order.id }, data: { totalParticipants: 100 } });
    expect((await getOrderInventory(org.id, order.id))?.lines[0]).toMatchObject({ required: 22, sent: 44, surplus: 22 });
    const back = await returnOrderItem(org.id, order.id, paneer.id, actor.id);
    expect(back.quantity).toBe(44);
    expect(await stockOf(paneer.id)).toBe(100);
    const ledger = await prisma.inventoryTransaction.findMany({ where: { orderId: order.id }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((r) => [r.type, Number(r.quantity)])).toEqual([["STOCK_OUT", 22], ["STOCK_OUT", 22], ["STOCK_IN", 44]]);
    await expect(returnOrderItem(org.id, order.id, paneer.id, actor.id)).rejects.toThrow(/Nothing is sent/);
  });

  it("a completed order's items can no longer be sent or returned here", async () => {
    const { org, actor, order, paneer } = await setup(50);
    await approve(order.id);
    await sendOrderItems(org.id, order.id, actor.id);
    await prisma.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    expect((await getOrderInventory(org.id, order.id))?.canReturn).toBe(false);
    await expect(returnOrderItem(org.id, order.id, paneer.id, actor.id)).rejects.toBeInstanceOf(StockTakeError);
  });

  it("another kitchen cannot read or send this order's items", async () => {
    const a = await setup(50);
    const b = await setup(50);
    await approve(a.order.id);
    expect(await getOrderInventory(b.org.id, a.order.id)).toBeNull();
    await expect(sendOrderItems(b.org.id, a.order.id, b.actor.id)).rejects.toThrow();
    await expect(returnOrderItem(b.org.id, a.order.id, a.paneer.id, b.actor.id)).rejects.toThrow();
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
