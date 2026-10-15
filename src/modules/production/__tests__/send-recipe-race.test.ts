import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createCustomer } from "@/modules/customers/customer";
import { createOrder } from "@/modules/orders/order";
import { createMenuItem } from "@/modules/menus/item";
import { createInventoryItem, recordStockTransaction } from "@/modules/inventory/inventory";
import { getRecipeForItem, saveRecipe, setRecipeStatus } from "@/modules/recipes/recipe";
import { findStockMismatches, todayDate } from "@/modules/inventory/batches";
import { sendOrderItems, StockTakeError } from "@/modules/production/production";

/**
 * The race: the plan is read and confirmed while a recipe is Active, then the recipe is returned to Draft (or changed) before the
 * stock is committed. Sending must re-check inside its own transaction and refuse, so stock is never deducted for a Draft recipe.
 */

const orgIds: string[] = [];
const userIds: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
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

/** An Active recipe (2 kg of paneer per 10 servings), 30 kg in stock, and an approved order needing 22 kg. */
async function setup() {
  const org = await prisma.organization.create({ data: { id: crypto.randomUUID(), name: "Race Org", slug: `race-${crypto.randomUUID().slice(0, 8)}`, createdAt: new Date() } });
  orgIds.push(org.id);
  const actor = await prisma.user.create({ data: { id: crypto.randomUUID(), name: "Owner", email: `o-${crypto.randomUUID()}@example.test`, emailVerified: true } });
  userIds.push(actor.id);
  const customer = await createCustomer(org.id, { name: "Asha", phone: "9876543210" }, actor.id);
  const paneer = await createInventoryItem(org.id, { name: "Paneer", category: "Dairy", unit: "kg" }, actor.id);
  const dish = await createMenuItem(org.id, { name: "Paneer Masala", foodType: "VEGETARIAN", price: 100 }, actor.id);
  await saveRecipe(org.id, dish.id, { yieldServings: 10, ingredients: [{ inventoryId: paneer.id, quantity: 2 }] }, actor.id);
  await setRecipeStatus(org.id, dish.id, "ACTIVE", actor.id);
  const date = new Date();
  const order = await createOrder(org.id, { customerId: customer.id, eventStartDate: date, eventEndDate: date, totalParticipants: 100, mealPlanEntries: [{ date, mealType: "LUNCH", items: [{ itemType: "MENU_ITEM", catalogId: dish.id, quantity: 1 }] }] }, actor.id);
  await prisma.order.update({ where: { id: order.id }, data: { status: "APPROVED" } });
  await recordStockTransaction(org.id, paneer.id, { type: "STOCK_IN", quantity: 30, unitCost: 40, expiryDate: new Date(todayDate().getTime() + 30 * 86_400_000) }, actor.id);
  return { org, actor, paneer, dish, order };
}

/** Runs `change` right after the send has read its plan (the first read of the order with its meal plan) and before its transaction starts. */
function afterPlanRead(change: () => Promise<unknown>) {
  const original = prisma.order.findFirst.bind(prisma.order);
  let done = false;
  vi.spyOn(prisma.order, "findFirst").mockImplementation(((args: { include?: Record<string, unknown> }) => {
    const result = original(args as never);
    if (done || !args?.include?.mealPlanEntries) return result;
    done = true;
    return result.then(async (row: unknown) => {
      await change();
      return row;
    });
  }) as never);
}

async function untouched(w: Awaited<ReturnType<typeof setup>>) {
  expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: w.paneer.id } })).stockCount)).toBe(30);
  expect(await prisma.inventoryTransaction.count({ where: { inventoryId: w.paneer.id, type: "STOCK_OUT" } })).toBe(0);
  expect(await prisma.stockAllocation.count({ where: { transaction: { orderId: w.order.id } } })).toBe(0);
  expect((await prisma.stockBatch.findFirstOrThrow({ where: { inventoryId: w.paneer.id } })).remainingQuantity.toString()).toBe("30");
  expect((await prisma.order.findUniqueOrThrow({ where: { id: w.order.id }, select: { stockDeductedAt: true } })).stockDeductedAt).toBeNull();
  expect(await findStockMismatches(w.org.id)).toEqual([]);
}

describe("sending stock re-checks the recipe at the point of commitment", () => {
  it("a recipe returned to Draft after the plan was read cannot have its stock deducted", async () => {
    const w = await setup();
    afterPlanRead(() => setRecipeStatus(w.org.id, w.dish.id, "DRAFT", w.actor.id));
    await expect(sendOrderItems(w.org.id, w.order.id, w.actor.id)).rejects.toBeInstanceOf(StockTakeError);
    vi.restoreAllMocks();
    expect((await getRecipeForItem(w.org.id, w.dish.id))?.status).toBe("DRAFT");
    await untouched(w);
    // and once it is Draft, a fresh attempt is refused the ordinary way
    await expect(sendOrderItems(w.org.id, w.order.id, w.actor.id)).rejects.toThrow(/Draft/);
    await untouched(w);
  });

  it("a recipe changed and re-activated after the plan was read (different quantities) is not sent on the old numbers", async () => {
    const w = await setup();
    afterPlanRead(async () => {
      await saveRecipe(w.org.id, w.dish.id, { yieldServings: 10, ingredients: [{ inventoryId: w.paneer.id, quantity: 5 }] }, w.actor.id); // back to Draft
      await setRecipeStatus(w.org.id, w.dish.id, "ACTIVE", w.actor.id); // Active again, but not what was confirmed
    });
    await expect(sendOrderItems(w.org.id, w.order.id, w.actor.id)).rejects.toThrow(/changed while you were confirming/);
    vi.restoreAllMocks();
    await untouched(w);
    // reviewing the order again (a new plan) sends the new quantity: 110 servings x 5 kg / 10 = 55 kg is more than 30 in stock, so it sends what is there
    const result = await sendOrderItems(w.org.id, w.order.id, w.actor.id);
    expect(result.shortages).toEqual([{ name: "Paneer", short: 25 }]);
  });

  it("with nothing changed in between, the send goes through exactly as before", async () => {
    const w = await setup();
    await sendOrderItems(w.org.id, w.order.id, w.actor.id);
    expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: w.paneer.id } })).stockCount)).toBe(8);
    expect(await prisma.stockAllocation.count({ where: { transaction: { orderId: w.order.id } } })).toBe(1);
    expect(await findStockMismatches(w.org.id)).toEqual([]);
  });

  it("a send and a return-to-Draft started at the same moment end in one consistent state: sent while Active, or refused with nothing deducted", async () => {
    for (let run = 0; run < 6; run++) {
      const w = await setup();
      const [send, draft] = await Promise.allSettled([sendOrderItems(w.org.id, w.order.id, w.actor.id), setRecipeStatus(w.org.id, w.dish.id, "DRAFT", w.actor.id)]);
      expect(draft.status).toBe("fulfilled");
      expect((await getRecipeForItem(w.org.id, w.dish.id))?.status).toBe("DRAFT");
      if (send.status === "fulfilled") {
        // it committed first, while the recipe was still Active: the whole 22 kg moved, once, with its allocation
        expect(Number((await prisma.inventory.findUniqueOrThrow({ where: { id: w.paneer.id } })).stockCount)).toBe(8);
        expect(await prisma.inventoryTransaction.count({ where: { inventoryId: w.paneer.id, type: "STOCK_OUT" } })).toBe(1);
        expect(await findStockMismatches(w.org.id)).toEqual([]);
      } else {
        expect(send.reason).toBeInstanceOf(StockTakeError);
        await untouched(w);
      }
    }
  });

  it("the lock the send takes on the recipe really holds a return-to-Draft back until the send's transaction has ended", async () => {
    const w = await setup();
    const recipe = (await getRecipeForItem(w.org.id, w.dish.id))!;
    let changed = false;
    let change: Promise<unknown> = Promise.resolve();
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "recipe" WHERE "id" = ANY(${[recipe.id]}::text[]) FOR SHARE`; // the same statement the send runs
      change = setRecipeStatus(w.org.id, w.dish.id, "DRAFT", w.actor.id).then(() => {
        changed = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(changed).toBe(false); // still waiting: it cannot slip in before the send commits
      expect((await tx.recipe.findUniqueOrThrow({ where: { id: recipe.id } })).status).toBe("ACTIVE");
    });
    await change;
    expect(changed).toBe(true);
    expect((await getRecipeForItem(w.org.id, w.dish.id))?.status).toBe("DRAFT");
  });
});
