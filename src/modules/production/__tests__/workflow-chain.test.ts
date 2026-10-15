import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createMenuItem } from "@/modules/menus/item";
import { createSupplier } from "@/modules/suppliers/supplier";
import { createInventoryItem, recordStockTransaction } from "@/modules/inventory/inventory";
import { createPurchaseOrder, markOrdered, receiveStock } from "@/modules/purchasing/purchase-order";
import { saveRecipe, getRecipeForItem, setRecipeStatus } from "@/modules/recipes/recipe";
import { findStockMismatches, todayDate, usableQueues } from "@/modules/inventory/batches";
import { costRecipe } from "@/modules/recipes/recipe-cost-math";
import { getOrderInventory, sendOrderItems } from "@/modules/production/production";

/** The whole workflow through the real functions: purchase order -> receipts -> batches -> recipe ingredient -> recipe cost -> stock deduction. */

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  await prisma.auditLog.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.purchaseOrder.deleteMany({ where: { organizationId: { in: orgIds } } });
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
const stock = async (id: string) => Number((await prisma.inventory.findUniqueOrThrow({ where: { id } })).stockCount);

async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Chain Org", slug: `chain-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const supplier = await createSupplier(org.id, { name: "Dairy Farm" }, actor.id);
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, actor.id);
  const decoy = await createInventoryItem(org.id, { name: "Paneer (old)", category: "Dairy", unit: "kg" }, actor.id); // a look-alike that must never be used
  await prisma.supplierItem.create({ data: { organizationId: org.id, supplierId: supplier.id, inventoryId: paneer.id } });
  const dish = await createMenuItem(org.id, { name: "Paneer Masala", foodType: "VEGETARIAN", price: 100 }, actor.id);
  // 10 servings need 2 kg of Paneer
  await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] }, actor.id);
  await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id); // a recipe is only used for production once it is approved
  const customer = await createCustomer(org.id, { name: "Asha", phone: "9876543210" }, actor.id);
  const date = new Date();
  // 100 guests + 10% extra = 110 servings = 22 kg
  const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: date, eventEndDate: date, totalParticipants: 100, mealPlanEntries: [{ date, mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: dish.id, quantity: 1 }] }] }, actor.id);
  await prisma.order.update({ where: { id: order.id }, data: { status: "APPROVED" } });
  const po = await createPurchaseOrder(org.id, { supplierId: supplier.id, items: [{ inventoryId: paneer.id, quantity: 40 }] }, actor.id);
  const lineId = po.items[0].id;
  const receive = (quantity: number, unitCost: number, expiryDate: Date) =>
    receiveStock(org.id, po.id, { idempotencyKey: crypto.randomUUID(), receivedDate: todayDate(), lines: [{ itemId: lineId, quantity, unitCost, expiryDate }] }, actor.id);
  const recipeCost = async () => {
    const recipe = (await getRecipeForItem(org.id, dish.id))!;
    const queues = await usableQueues(org.id, [paneer.id]);
    return costRecipe(recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity), queue: queues.get(i.inventoryId) ?? [], itemCost: null })), Number(recipe.yieldServings));
  };
  return { org, actor, paneer, decoy, dish, order, po, receive, recipeCost };
}

describe("purchase order -> receipt -> batches -> recipe -> cost -> stock deduction", () => {
  it("follows one chain of ids and costs, and every number reconciles", async () => {
    const { org, actor, paneer, decoy, dish, order, po, receive, recipeCost } = await setup();

    // 1. Raising and ordering add no stock; there is nothing to cost yet.
    await markOrdered(org.id, po.id, actor.id);
    expect(await stock(paneer.id)).toBe(0);
    expect(await prisma.stockBatch.count({ where: { organizationId: org.id } })).toBe(0);
    expect((await recipeCost()).state).toBe("INCOMPLETE"); // no stock covers the recipe

    // 2. First receipt: 10 kg @ 40 (partial). Batch, ledger row and allocation exist; the PO is partly received. 10 kg covers the recipe's 2 kg, so it is verified at 40 x 2 / 10.
    expect((await receive(10, 40, day(20))).status).toBe("PARTIALLY_RECEIVED");
    expect(await stock(paneer.id)).toBe(10);
    expect(await recipeCost()).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 8 });

    // 3. Second receipt against the same PO: 25 kg @ 50 with a later expiry -> a separate batch, still partial (35 of 40).
    expect((await receive(25, 50, day(40))).status).toBe("PARTIALLY_RECEIVED");
    expect(await stock(paneer.id)).toBe(35);
    const batches = await prisma.stockBatch.findMany({ where: { inventoryId: paneer.id }, orderBy: { createdAt: "asc" } });
    expect(batches.map((b) => [b.source, Number(b.originalQuantity), Number(b.unitCost)])).toEqual([["RECEIPT", 10, 40], ["RECEIPT", 25, 50]]);
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: paneer.id, type: "STOCK_IN" } })).toBe(2);
    expect(await prisma.goodsReceipt.count({ where: { purchaseOrderId: po.id } })).toBe(2);

    // 4. The recipe's ingredient is this exact inventory item (not the look-alike), and the order needs 22 kg of it.
    const recipe = await getRecipeForItem(org.id, dish.id);
    expect(recipe?.ingredients.map((i) => i.inventoryId)).toEqual([paneer.id]);
    expect(recipe?.ingredients[0].inventoryId).not.toBe(decoy.id);
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.lines.map((l) => [l.inventoryId, l.required])).toEqual([[paneer.id, 22]]);

    // 5. Send to the order: FIFO takes 10 @ 40 then 12 @ 50; the order costs 400 + 600; the decoy is untouched.
    await sendOrderItems(org.id, order.id, actor.id);
    expect(await stock(paneer.id)).toBe(13);
    expect(await stock(decoy.id)).toBe(0);
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: decoy.id } })).toBe(0);
    const slices = await prisma.stockAllocation.findMany({ where: { transaction: { orderId: order.id } }, orderBy: { unitCost: "asc" } });
    expect(slices.map((s) => [Number(s.quantity), Number(s.unitCost)])).toEqual([[10, 40], [12, 50]]);
    expect((await getOrderInventory(org.id, order.id))?.lines[0]).toMatchObject({ sent: 22, sentCost: 1000, sentCostUnknown: 0 });

    // 6. The recipe now costs from what is left (the 50 batch); the PO's received quantity is untouched by consumption.
    expect(await recipeCost()).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 10 });
    expect((await prisma.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: po.id } })).receivedQuantity.toString()).toBe("35");

    // 7. Everything reconciles.
    expect(await findStockMismatches(org.id)).toEqual([]);
  });

  it("an unknown-cost batch or too little stock keeps the recipe from being verified, and the cost is never guessed", async () => {
    const { org, actor, paneer, receive, recipeCost } = await setup();
    await markOrdered(org.id, (await prisma.purchaseOrder.findFirstOrThrow({ where: { organizationId: org.id } })).id, actor.id);
    // manual Stock In with an unknown cost, ahead of a known-cost receipt: the recipe's 2 kg would come from the unknown batch
    await recordStockTransaction(org.id, paneer.id, { type: "STOCK_IN", quantity: 5, costUnknown: true, expiryDate: day(10) }, actor.id);
    await receive(10, 40, day(20));
    const incomplete = await recipeCost();
    expect(incomplete).toMatchObject({ state: "INCOMPLETE", verifiedCostPerServing: null });
    expect(incomplete.ingredients[0].status).toBe("UNKNOWN_COST");
    expect(incomplete.issues[0].inventoryId).toBe(paneer.id);
    expect(incomplete.estimatedCostPerServing).toBeNull(); // no item cost, so not even an estimate is made up
  });
});
