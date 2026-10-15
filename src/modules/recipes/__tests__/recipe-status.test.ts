import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem, recordStockTransaction } from "@/modules/inventory/inventory";
import { copyRecipe, getRecipeForItem, saveRecipe, setRecipeStatus } from "@/modules/recipes/recipe";
import { findStockMismatches, todayDate, usableQueues } from "@/modules/inventory/batches";
import { costRecipe } from "@/modules/recipes/recipe-cost-math";
import { getOrderInventory, getProductionPlan, sendOrderItems, StockTakeError } from "@/modules/production/production";

/** Recipe lifecycle: Draft until explicitly activated. Approval is separate from cost verification and never touches stock. */

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

async function newOrg(name: string) {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name, slug: `rs-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  return { org, actor };
}

/** 100 guests + 10% extra = 110 servings; paneer recipe 2 kg per 10 servings = 22 kg for the order. The recipe is saved as a Draft. */
async function setup() {
  const { org, actor } = await newOrg("Status Org");
  const customer = await createCustomer(org.id, { name: "Asha", phone: "9876543210" }, actor.id);
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, actor.id);
  const dish = await createMenuItem(org.id, { name: "Paneer Masala", foodType: "VEGETARIAN", price: 100 }, actor.id);
  await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] }, actor.id);
  const date = new Date();
  const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: date, eventEndDate: date, totalParticipants: 100, mealPlanEntries: [{ date, mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: dish.id, quantity: 1 }] }] }, actor.id);
  await prisma.order.update({ where: { id: order.id }, data: { status: "APPROVED" } });
  const stockIn = (quantity: number, unitCost: number | null) =>
    recordStockTransaction(org.id, paneer.id, unitCost === null ? { type: "STOCK_IN", quantity, costUnknown: true, expiryDate: day(30) } : { type: "STOCK_IN", quantity, unitCost, expiryDate: day(30) }, actor.id);
  const status = async () => (await getRecipeForItem(org.id, dish.id))!.status;
  const cost = async () => {
    const recipe = (await getRecipeForItem(org.id, dish.id))!;
    const queues = await usableQueues(org.id, [paneer.id]);
    return costRecipe(recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity), queue: queues.get(i.inventoryId) ?? [], itemCost: null })), Number(recipe.yieldServings));
  };
  return { org, actor, paneer, dish, order, stockIn, status, cost };
}

/** Everything a status change must leave alone: stock, batches, allocations and the ledger. */
async function stockState(orgId: string) {
  const [items, batches, allocations, ledger] = await Promise.all([
    prisma.inventory.findMany({ where: { organizationId: orgId }, select: { id: true, stockCount: true }, orderBy: { id: "asc" } }),
    prisma.stockBatch.findMany({ where: { organizationId: orgId }, orderBy: { id: "asc" } }),
    prisma.stockAllocation.findMany({ where: { batch: { organizationId: orgId } }, orderBy: { id: "asc" } }),
    prisma.inventoryTransaction.findMany({ where: { inventory: { organizationId: orgId } }, orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ items, batches, allocations, ledger });
}

describe("new recipes are Draft", () => {
  it("a saved recipe starts as a Draft with no approval recorded, and so does a copy", async () => {
    const { org, actor, dish, status } = await setup();
    expect(await status()).toBe("DRAFT");
    const saved = await getRecipeForItem(org.id, dish.id);
    expect([saved?.activatedAt, saved?.activatedByUserId]).toEqual([null, null]);
    const other = await createMenuItem(org.id, { name: "Palak Paneer", foodType: "VEGETARIAN", price: 120 }, actor.id);
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    await copyRecipe(org.id, dish.id, other.id, actor.id);
    expect((await getRecipeForItem(org.id, other.id))?.status).toBe("DRAFT"); // an approval is not inherited by a copy
  });
});

describe("a Draft recipe is never used for production", () => {
  it("the order does not count it, sends nothing, and the server refuses; stock and the ledger are untouched", async () => {
    const { org, actor, paneer, order, stockIn } = await setup();
    await stockIn(50, 40);
    const plan = await getOrderInventory(org.id, order.id);
    expect(plan?.lines).toEqual([]); // no required quantity from a Draft
    expect(plan?.draftRecipe).toEqual(["Paneer Masala"]);
    expect(plan?.withoutRecipe).toEqual([]);
    expect(plan?.canSend).toBe(false);
    expect(plan?.blockedReason).toMatch(/Draft/);
    const before = await stockState(org.id);
    await expect(sendOrderItems(org.id, order.id, actor.id)).rejects.toBeInstanceOf(StockTakeError);
    expect(await stockState(org.id)).toBe(before);
    expect(await prisma.inventoryTransaction.count({ where: { inventoryId: paneer.id, orderId: order.id } })).toBe(0);
    expect(await prisma.order.findUniqueOrThrow({ where: { id: order.id }, select: { stockDeductedAt: true } })).toEqual({ stockDeductedAt: null });
  });

  it("the production plan lists it as a Draft and adds no demand or shortfall for it", async () => {
    const { org, order } = await setup();
    await prisma.order.update({ where: { id: order.id }, data: { status: "SENT_TO_KITCHEN" } });
    const plan = await getProductionPlan(org.id);
    expect(plan.draftRecipes).toEqual(["Paneer Masala"]);
    expect(plan.shortfalls).toEqual([]);
    expect(plan.totals).toEqual([]);
  });

  it("returning an Active recipe to Draft stops further sends, but what was already sent keeps its quantity and cost", async () => {
    const { org, actor, dish, order, stockIn } = await setup();
    await stockIn(30, 40);
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    await sendOrderItems(org.id, order.id, actor.id);
    const sent = (await getOrderInventory(org.id, order.id))?.lines[0];
    expect(sent).toMatchObject({ sent: 22, sentCost: 880 });
    await setRecipeStatus(org.id, dish.id, "DRAFT", actor.id);
    const after = await getOrderInventory(org.id, order.id);
    expect(after?.draftRecipe).toEqual(["Paneer Masala"]);
    expect(after?.lines[0]).toMatchObject({ sent: 22, sentCost: 880, fromRecipes: 0 }); // history kept; the Draft adds no new requirement
    await expect(sendOrderItems(org.id, order.id, actor.id)).rejects.toBeInstanceOf(StockTakeError);
  });
});

describe("activation is explicit", () => {
  it("a valid Draft can be activated: the status, who and when are recorded, and the order then plans and sends from it", async () => {
    const { org, actor, dish, order, stockIn, status } = await setup();
    await stockIn(30, 40);
    const result = await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    expect(result.status).toBe("ACTIVE");
    expect(await status()).toBe("ACTIVE");
    const row = await getRecipeForItem(org.id, dish.id);
    expect(row?.activatedByUserId).toBe(actor.id);
    expect(row?.activatedAt).toBeInstanceOf(Date);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "recipe.activate", recordId: row!.id } })).toBe(1);
    expect((await getOrderInventory(org.id, order.id))?.lines[0]).toMatchObject({ required: 22 });
    await sendOrderItems(org.id, order.id, actor.id);
    // repeating is harmless: nothing changes, no second audit entry
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    expect(await prisma.auditLog.count({ where: { organizationId: org.id, action: "recipe.activate" } })).toBe(1);
  });

  it("changing the status alters no stock, batch, allocation, ledger row or recorded cost", async () => {
    const { org, actor, dish, order, stockIn } = await setup();
    await stockIn(10, 40);
    await stockIn(30, 55);
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    await sendOrderItems(org.id, order.id, actor.id);
    const before = await stockState(org.id);
    const cost = (await getOrderInventory(org.id, order.id))?.lines[0].sentCost;
    await setRecipeStatus(org.id, dish.id, "DRAFT", actor.id);
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    expect(await stockState(org.id)).toBe(before);
    expect((await getOrderInventory(org.id, order.id))?.lines[0].sentCost).toBe(cost);
    expect(cost).toBe(10 * 40 + 12 * 55);
    expect(await findStockMismatches(org.id)).toEqual([]);
  });

  it("editing the servings or the ingredients of an Active recipe returns it to Draft; editing the notes does not", async () => {
    const { org, actor, paneer, dish, status } = await setup();
    const input = { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] };
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    await saveRecipe(org.id, dish.id, { ...input, notes: "More salt" }, actor.id);
    expect(await status()).toBe("ACTIVE");
    await saveRecipe(org.id, dish.id, { ...input, yieldServings: 12 }, actor.id);
    expect(await status()).toBe("DRAFT");
    expect((await getRecipeForItem(org.id, dish.id))?.activatedAt).toBeNull();
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    await saveRecipe(org.id, dish.id, { yieldServings: 12, ingredients: [{ inventoryId: paneer.id, quantity: 3 }] }, actor.id);
    expect(await status()).toBe("DRAFT");
  });
});

describe("activation cannot bypass the recipe's validation", () => {
  it("refuses a dish with no recipe, no ingredients, a zero quantity, or an ingredient from another kitchen", async () => {
    const { org, actor, paneer, dish, status } = await setup();
    const bare = await createMenuItem(org.id, { name: "No Recipe", foodType: "VEGETARIAN", price: 50 }, actor.id);
    await expect(setRecipeStatus(org.id, bare.id, "ACTIVE", actor.id)).rejects.toThrow(/no recipe/);

    // Saving already refuses these; a bad row written around it is still not activatable.
    await expect(saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [] }, actor.id)).rejects.toThrow(/at least one ingredient/);
    const recipe = (await getRecipeForItem(org.id, dish.id))!;
    await prisma.recipeIngredient.updateMany({ where: { recipeId: recipe.id }, data: { quantity: 0 } });
    await expect(setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id)).rejects.toThrow(/quantity greater than zero/);
    await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    await expect(setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id)).rejects.toThrow(/at least one ingredient/);

    const { org: other, actor: otherActor } = await newOrg("Other Org");
    const foreign = await createInventoryItem(other.id, { name: "Foreign Paneer", category: "Dairy", unit: "kg" }, otherActor.id);
    await expect(saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: foreign.id, quantity: 2 }] }, actor.id)).rejects.toThrow(/not in your inventory/);
    await prisma.recipeIngredient.create({ data: { recipeId: recipe.id, inventoryId: foreign.id, quantity: 2 } });
    await expect(setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id)).rejects.toThrow(/not in your inventory/);
    expect(await status()).toBe("DRAFT");
    void paneer;
  });

  it("another kitchen cannot change this kitchen's recipe status", async () => {
    const { org, actor, dish, status } = await setup();
    const { org: other, actor: otherActor } = await newOrg("Other Org");
    await expect(setRecipeStatus(other.id, dish.id, "ACTIVE", otherActor.id)).rejects.toThrow(/no recipe/);
    expect(await status()).toBe("DRAFT");
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    await expect(setRecipeStatus(other.id, dish.id, "DRAFT", otherActor.id)).rejects.toThrow(/no recipe/);
    expect(await status()).toBe("ACTIVE");
  });
});

describe("approval and cost verification are independent", () => {
  it("Draft + Verified cost stays Draft: a cost becoming Verified never activates it", async () => {
    const { org, stockIn, status, cost } = await setup();
    expect((await cost()).state).toBe("INCOMPLETE");
    await stockIn(30, 40);
    expect((await cost()).state).toBe("VERIFIED");
    expect(await status()).toBe("DRAFT");
    expect((await getRecipeForItem(org.id, (await prisma.recipe.findFirstOrThrow({ where: { organizationId: org.id } })).menuItemId))?.activatedAt).toBeNull();
  });

  it("Active + Incomplete cost stays Active but is not Verified, and production still follows the existing stock rules", async () => {
    const { org, actor, paneer, dish, order, stockIn, status, cost } = await setup();
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    // no stock at all: Active, cost incomplete (not covered), and nothing can be taken (never below zero), the shortage is reported
    expect(await status()).toBe("ACTIVE");
    expect((await cost()).state).toBe("INCOMPLETE");
    const none = await sendOrderItems(org.id, order.id, actor.id);
    expect(none).toMatchObject({ lines: 0 });
    expect(none.shortages).toEqual([{ name: "Paneer", short: 22 }]);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: paneer.id } })).stockCount)).toBe(0);

    // unknown-cost stock: Active, cost still not verified; what is sent is recorded with an unknown cost, never a guessed one
    await stockIn(10, null);
    const incomplete = await cost();
    expect(incomplete).toMatchObject({ state: "INCOMPLETE", verifiedCostPerServing: null });
    expect(await status()).toBe("ACTIVE");
    await sendOrderItems(org.id, order.id, actor.id);
    expect((await getOrderInventory(org.id, order.id))?.lines[0]).toMatchObject({ sent: 10, sentCost: 0, sentCostUnknown: 10, short: 12 });
    expect(await findStockMismatches(org.id)).toEqual([]);
  });

  it("Active + Verified cost is both", async () => {
    const { org, actor, dish, stockIn, status, cost } = await setup();
    await stockIn(30, 40);
    await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
    expect(await status()).toBe("ACTIVE");
    expect(await cost()).toMatchObject({ state: "VERIFIED", verifiedCostPerServing: 8 });
    expect(org.id).toBeTruthy();
  });
});
