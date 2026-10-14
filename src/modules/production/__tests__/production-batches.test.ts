import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem } from "@/modules/inventory/inventory";
import { saveRecipe } from "@/modules/recipes/recipe";
import { createBatch, findStockMismatches, previewConsumption, todayDate, usableQueues } from "@/modules/inventory/batches";
import { costRecipe } from "@/modules/recipes/recipe-cost-math";
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

  it("the recipe cost preview and the real consumption use the same FIFO slices, and the preview deducts nothing", async () => {
    const { org, actor, order, paneer, batch } = await setup();
    await batch(10, 100, { receivedDate: day(-5) });
    await batch(30, 150, { receivedDate: day(-1) });
    const before = { stock: await stock(paneer.id), batches: await prisma.stockBatch.count(), tx: await prisma.inventoryTransaction.count({ where: { inventoryId: paneer.id } }), allocs: await prisma.stockAllocation.count() };

    const preview = (await previewConsumption(org.id, [{ key: "order", inventoryId: paneer.id, quantity: 22 }])).get("order")!;
    expect(preview.shortfall).toBe(0);
    expect(preview.slices.map((s) => [s.quantity, s.unitCost])).toEqual([[10, 100], [12, 150]]);
    // nothing changed by looking
    expect({ stock: await stock(paneer.id), batches: await prisma.stockBatch.count(), tx: await prisma.inventoryTransaction.count({ where: { inventoryId: paneer.id } }), allocs: await prisma.stockAllocation.count() }).toEqual(before);
    expect((await prisma.stockBatch.findMany({ where: { inventoryId: paneer.id }, orderBy: { createdAt: "asc" } })).map((b) => Number(b.remainingQuantity))).toEqual([10, 30]);

    await sendOrderItems(org.id, order.id, actor.id);
    const stored = await prisma.stockAllocation.findMany({ where: { transaction: { orderId: order.id } }, orderBy: { unitCost: "asc" } });
    expect(stored.map((s) => [Number(s.quantity), Number(s.unitCost)])).toEqual(preview.slices.map((s) => [s.quantity, s.unitCost]));
    expect(await stock(paneer.id)).toBe(18);
  });

  it("a recipe is costed from the batches it would use: known costs verify, and the cost moves to the next batch as stock is used", async () => {
    const { org, actor, order, paneer, batch } = await setup();
    await batch(10, 100, { receivedDate: day(-5) });
    await batch(30, 150, { receivedDate: day(-1) });
    const recipeCost = async () => {
      const queue = (await usableQueues(org.id, [paneer.id])).get(paneer.id) ?? [];
      return costRecipe([{ inventoryId: paneer.id, name: "Paneer", unit: "kg", quantity: 2, queue, itemCost: 90 }], 10);
    };
    expect(await recipeCost()).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 20, estimatedCostPerServing: null }); // 2 kg x 100 / 10 servings
    await sendOrderItems(org.id, order.id, actor.id); // 22 kg: empties the first batch, takes 12 of the second
    expect(await recipeCost()).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 30 });
  });

  it("unknown-cost stock before a known batch makes the recipe incomplete (not skipped); the item's own cost is only a separate estimate", async () => {
    const { org, paneer, batch } = await setup();
    await prisma.$transaction((tx) => createBatch(tx, { organizationId: org.id, inventoryId: paneer.id, source: "OPENING", quantity: 3, unitCost: null }));
    await batch(40, 150, { receivedDate: day(-1) });
    const queue = (await usableQueues(org.id, [paneer.id])).get(paneer.id) ?? [];
    const cost = costRecipe([{ inventoryId: paneer.id, name: "Paneer", unit: "kg", quantity: 5, queue, itemCost: 100 }], 10);
    expect(cost.state).toBe("INCOMPLETE");
    expect(cost.verifiedCostPerServing).toBeNull();
    expect(cost.ingredients[0]).toMatchObject({ status: "UNKNOWN_COST", unknownQuantity: 3, knownCost: 300 }); // the unknown 3 kg comes first; the later 150 batch is not used to stand in for it
    expect(cost.issues).toEqual([{ inventoryId: paneer.id, name: "Paneer", reason: "3 kg would come from stock with no known cost" }]);
    expect(cost.estimatedCostPerServing).toBe(60); // (3 x 100 item cost + 2 x 150) / 10, labelled Estimated in the screens
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
