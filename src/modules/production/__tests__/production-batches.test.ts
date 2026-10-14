import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem } from "@/modules/inventory/inventory";
import { saveRecipe } from "@/modules/recipes/recipe";
import { costPerServing } from "@/modules/recipes/recipe-math";
import { createBatch, currentUnitCosts, findStockMismatches, todayDate } from "@/modules/inventory/batches";
import { getOrderInventory, sendOrderItems, returnAllOrderItems } from "@/modules/production/production";

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

const day = (offset: number) => new Date(todayDate().getTime() + offset * 86_400_000);

/** 100 guests + 10% extra = 110 servings; paneer recipe 2 kg per 10 servings = 22 kg for the order. */
async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Cost Org", slug: `cost-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Asha", phone: "9876543210" }, actor.id);
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, actor.id);
  const dish = await createMenuItem(org.id, { name: "Paneer Masala", foodType: "VEGETARIAN", price: 100 }, actor.id);
  await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] }, actor.id);
  const date = new Date();
  const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: date, eventEndDate: date, totalParticipants: 100, mealPlanEntries: [{ date, mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: dish.id, quantity: 1 }] }] }, actor.id);
  await prisma.order.update({ where: { id: order.id }, data: { status: "APPROVED" } });
  const batch = (quantity: number, unitCost: number | null, extra: { receivedDate?: Date; expiryDate?: Date } = {}) =>
    prisma.$transaction((tx) => createBatch(tx, { organizationId: org.id, inventoryId: paneer.id, source: "RECEIPT", quantity, unitCost, receivedDate: extra.receivedDate ?? new Date(), expiryDate: extra.expiryDate ?? day(30) }));
  return { org, actor, paneer, order, batch, dish };
}

const stock = async (id: string) => Number((await prisma.inventory.findUniqueOrThrow({ where: { id } })).stockCount);

describe("Recipe consumption and costing with batches", () => {
  it("sending an order takes the recipe quantity from several batches, oldest first, and costs it from them", async () => {
    const { org, actor, order, paneer, batch } = await setup();
    await batch(15, 100, { receivedDate: day(-5) });
    await batch(15, 120, { receivedDate: day(-1) });
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.lines[0]).toMatchObject({ required: 22, inStock: 30 });

    await sendOrderItems(org.id, order.id, actor.id);
    expect(await stock(paneer.id)).toBe(8);
    const after = await getOrderInventory(org.id, order.id);
    expect(after?.lines[0]).toMatchObject({ sent: 22, sentCost: 15 * 100 + 7 * 120, sentCostUnknown: 0 });
    const slices = await prisma.stockAllocation.findMany({ where: { transaction: { orderId: order.id } }, orderBy: { unitCost: "asc" } });
    expect(slices.map((s) => [Number(s.quantity), Number(s.unitCost)])).toEqual([[15, 100], [7, 120]]);
    expect(await findStockMismatches(org.id)).toEqual([]);
  });

  it("a delivery at a new price afterwards does not change what the order's stock cost", async () => {
    const { org, actor, order, batch } = await setup();
    await batch(30, 100);
    await sendOrderItems(org.id, order.id, actor.id);
    await batch(50, 400);
    expect((await getOrderInventory(org.id, order.id))?.lines[0]).toMatchObject({ sentCost: 2200 });
  });

  it("recipe cost per serving uses the batch the kitchen would use next, with the existing formula", async () => {
    const { org, actor, order, paneer, batch } = await setup();
    await batch(10, 100, { receivedDate: day(-5) });
    await batch(30, 150, { receivedDate: day(-1) });
    const line = (cost: number | null) => [{ inventoryId: paneer.id, name: "Paneer", unit: "kg", quantity: 2, costPerUnit: cost }];
    let cost = (await currentUnitCosts(org.id, [paneer.id])).get(paneer.id) ?? null;
    expect(cost).toBe(100);
    expect(costPerServing(line(cost), 10)).toBe(20); // 2 kg x 100 / 10 servings
    await sendOrderItems(org.id, order.id, actor.id); // 22 kg: empties the first batch and takes 12 of the second
    cost = (await currentUnitCosts(org.id, [paneer.id])).get(paneer.id) ?? null;
    expect(cost).toBe(150);
    expect(costPerServing(line(cost), 10)).toBe(30);
    // an item with no usable batch falls back to its own cost
    await prisma.inventory.update({ where: { id: paneer.id }, data: { costPerUnit: 90 } });
    await prisma.stockBatch.updateMany({ where: { inventoryId: paneer.id }, data: { remainingQuantity: 0 } });
    await prisma.inventory.update({ where: { id: paneer.id }, data: { stockCount: 0 } });
    expect((await currentUnitCosts(org.id, [paneer.id])).get(paneer.id)).toBe(90);
  });

  it("expired stock is not sent to the order: it is treated as short and the plan shows only usable stock", async () => {
    const { org, actor, order, paneer, batch } = await setup();
    const old = await batch(15, 100, { receivedDate: day(-9), expiryDate: day(1) });
    await prisma.stockBatch.update({ where: { id: old.id }, data: { expiryDate: day(-1) } });
    await batch(10, 120);
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.lines[0]).toMatchObject({ inStock: 10, short: 12 });
    const result = await sendOrderItems(org.id, order.id, actor.id);
    expect(result.shortages).toEqual([{ name: "Paneer", short: 12 }]);
    expect(await stock(paneer.id)).toBe(15); // the expired 15 kg is still on the shelf, untouched
    expect(Number((await prisma.stockBatch.findUniqueOrThrow({ where: { id: old.id } })).remainingQuantity)).toBe(15);
  });

  it("cancelling returns everything to the batches it came from, at the same costs, and the cost of the order goes to nil", async () => {
    const { org, actor, order, paneer, batch } = await setup();
    const first = await batch(15, 100, { receivedDate: day(-5) });
    const second = await batch(15, 120, { receivedDate: day(-1) });
    await sendOrderItems(org.id, order.id, actor.id);
    await returnAllOrderItems(org.id, order.id, actor.id);
    expect(await stock(paneer.id)).toBe(30);
    expect(Number((await prisma.stockBatch.findUniqueOrThrow({ where: { id: first.id } })).remainingQuantity)).toBe(15);
    expect(Number((await prisma.stockBatch.findUniqueOrThrow({ where: { id: second.id } })).remainingQuantity)).toBe(15);
    expect(await findStockMismatches(org.id)).toEqual([]);
    const back = await getOrderInventory(org.id, order.id);
    expect(back?.lines[0]).toMatchObject({ sent: 0, sentCost: 0 });
  });
});
