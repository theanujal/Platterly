import "server-only";
import { orderAt } from "@/modules/locations/scope";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { KitchenProductionStatus, MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit/audit";
import { lockAndReadOrder } from "@/modules/orders/kitchen-lock";
import { getKitchenRules } from "@/modules/kitchen/kitchen-rules";
import { cookQuantity } from "@/modules/menu-approvals/kitchen-production-status";
import { consumeStock, InsufficientStockError, orderStockCost, restoreOrderStock, stockPosition, usableStockMap } from "@/modules/inventory/batches";
import { aggregateNeeds, quantityToTake, withStock, type PlanDish } from "./production-math";

export class StockTakeError extends Error {}

/** Whole-order guest count, the same rule the prep sheet uses: the event's count first, then the order's. */
function guestsFor(order: { totalParticipants: number | null; adultCount: number | null; childBelow5Count: number | null; child5To10Count: number | null; events: { guestCount: number | null }[] }) {
  const sum = (order.adultCount ?? 0) + (order.childBelow5Count ?? 0) + (order.child5To10Count ?? 0);
  return order.events[0]?.guestCount ?? order.totalParticipants ?? (sum > 0 ? sum : 0);
}

const ORDER_PLAN_INCLUDE = {
  events: { select: { guestCount: true, requiredInventory: { select: { inventoryId: true, quantity: true } } } },
  mealPlanEntries: {
    include: {
      items: {
        where: { itemType: "MENU_ITEM" as const, menuItemId: { not: null } },
        include: { menuItem: { select: { id: true, name: true, recipe: { include: { ingredients: { include: { inventory: { select: { id: true, name: true, unit: true } } } } } } } } },
      },
    },
  },
} as const;

type PlanOrder = NonNullable<Awaited<ReturnType<typeof loadPlanOrder>>>;

async function loadPlanOrder(organizationId: string, orderId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  return db.order.findFirst({ where: { id: orderId, organizationId }, include: ORDER_PLAN_INCLUDE });
}

function dishesOf(order: PlanOrder, servings: number): PlanDish[] {
  return order.mealPlanEntries.flatMap((entry) =>
    entry.items.flatMap((item) => {
      const dish = item.menuItem;
      if (!dish) return [];
      return [
        {
          menuItemId: dish.id,
          name: dish.name,
          servings,
          // Only an Active recipe is used for production, stock planning and stock deduction; a Draft is reported, never counted.
          draftRecipe: dish.recipe?.status === "DRAFT",
          recipe: dish.recipe?.status === "ACTIVE"
            ? { yieldServings: Number(dish.recipe.yieldServings), lines: dish.recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity) })) }
            : null,
        },
      ];
    }),
  );
}

/** What can actually be used for an order: stock that has not expired and is not quarantined. */
async function stockOf(organizationId: string, ids: string[]) {
  return usableStockMap(organizationId, ids);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Items can be set once the order is with the kitchen (AJ, 2026-10-10): the order is Approved, or already with the kitchen. */
const SENDABLE_STATUSES: OrderStatus[] = ["APPROVED", "SENT_TO_KITCHEN"];
/** ...and, since AJ's change of 2026-10-19, only once the kitchen has moved the menu out of Pending: the Inventory tab is activated by In Preparation (or later). */
const KITCHEN_STARTED_STAGES: KitchenProductionStatus[] = ["IN_PREPARATION", "READY", "DELIVERED"];
const kitchenStarted = (selections: { status: MenuSelectionStatus; stage: KitchenProductionStatus }[]) => selections.some((s) => s.status === "FINAL_LOCKED" && KITCHEN_STARTED_STAGES.includes(s.stage));
const CLOSED_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

export interface OrderInventoryLine {
  inventoryId: string;
  name: string;
  unit: string;
  /** What the dishes' recipes need (guests plus the extra percentage). */
  fromRecipes: number;
  /** What the team added by hand on the order (no recipe: gas, disposables). */
  extra: number;
  required: number;
  /** Net sent to this order so far (sent minus returned). */
  sent: number;
  /** Still to send: required minus sent. */
  remaining: number;
  /** Sent beyond what is now required (the menu shrank): can be returned. */
  surplus: number;
  inStock: number;
  /** Of what is still to send, how much the shelf cannot cover. */
  short: number;
  forDishes: string[];
  /** What the stock sent so far cost, from the batches it was taken from (FIFO). Unchanged by later deliveries. */
  sentCost: number;
  /** Quantity sent whose cost was never known (so `sentCost` leaves it out). */
  sentCostUnknown: number;
}

/**
 * The order's Inventory tab (AJ, 2026-10-10): what the order requires (every dish's recipe plus the extra items added by
 * hand), what has already been sent to it, what is still to send, and whether the shelf can cover it. Sent is read from
 * the ledger (stock-out rows tagged with the order, less stock-in rows for returns), so it is always what really moved.
 */
export async function getOrderInventory(organizationId: string, orderId: string) {
  const order = await loadPlanOrder(organizationId, orderId);
  if (!order) return null;
  const { extraPercent } = await getKitchenRules(organizationId);
  const guests = guestsFor(order);
  const servings = guests > 0 ? cookQuantity(guests, extraPercent) : 0;
  const { lines: recipeLines, withoutRecipe, draftRecipe } = aggregateNeeds(dishesOf(order, servings));

  const extras = new Map<string, number>();
  for (const event of order.events) for (const r of event.requiredInventory) extras.set(r.inventoryId, round3((extras.get(r.inventoryId) ?? 0) + Number(r.quantity)));

  const moved = await prisma.inventoryTransaction.groupBy({ by: ["inventoryId", "type"], where: { orderId }, _sum: { quantity: true } });
  const sentBy = new Map<string, number>();
  for (const row of moved) {
    const qty = Number(row._sum.quantity ?? 0);
    if (row.type === "STOCK_OUT") sentBy.set(row.inventoryId, round3((sentBy.get(row.inventoryId) ?? 0) + qty));
    else if (row.type === "STOCK_IN") sentBy.set(row.inventoryId, round3((sentBy.get(row.inventoryId) ?? 0) - qty));
  }

  const ids = [...new Set([...recipeLines.map((l) => l.inventoryId), ...extras.keys(), ...[...sentBy.entries()].filter(([, q]) => q !== 0).map(([id]) => id)])];
  const items = await prisma.inventory.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, name: true, unit: true, stockCount: true } });
  const usable = await usableStockMap(organizationId, ids);
  const costs = await orderStockCost(orderId);
  const itemById = new Map(items.map((i) => [i.id, i]));
  const recipeById = new Map(recipeLines.map((l) => [l.inventoryId, l]));

  const lines: OrderInventoryLine[] = ids
    .flatMap((id) => {
      const item = itemById.get(id);
      if (!item) return [];
      const fromRecipes = recipeById.get(id)?.needed ?? 0;
      const extra = extras.get(id) ?? 0;
      const required = round3(fromRecipes + extra);
      const sent = Math.max(0, sentBy.get(id) ?? 0);
      const remaining = Math.max(0, round3(required - sent));
      const inStock = usable.get(id) ?? Number(item.stockCount);
      return [
        {
          inventoryId: id,
          name: item.name,
          unit: item.unit,
          fromRecipes,
          extra,
          required,
          sent,
          remaining,
          surplus: Math.max(0, round3(sent - required)),
          inStock,
          short: Math.max(0, round3(remaining - inStock)),
          forDishes: recipeById.get(id)?.forDishes ?? [],
          sentCost: costs.get(id)?.cost ?? 0,
          sentCostUnknown: costs.get(id)?.unknownQuantity ?? 0,
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const selections = await prisma.menuSelection.findMany({ where: { organizationId, event: { orderId } }, select: { status: true, kitchenProductionStatus: true } });
  const started = kitchenStarted(selections.map((s) => ({ status: s.status, stage: s.kitchenProductionStatus })));
  const approved = SENDABLE_STATUSES.includes(order.status) && started;
  const closed = CLOSED_STATUSES.includes(order.status);
  const toSend = lines.some((l) => l.remaining > 0);
  const blockedReason = closed
    ? `This order is ${order.status === "COMPLETED" ? "completed" : "cancelled"}, so items can no longer be sent.`
    : !approved
      ? "Items can be sent once the kitchen starts preparing this order (moves it from Pending to In Preparation)."
      : lines.length === 0
        ? draftRecipe.length > 0
          ? `Nothing to send yet: the recipe for ${draftRecipe.join(", ")} is still a Draft. Activate it in Recipes to approve it for production, or add extra items.`
          : "Nothing to send yet: add recipes to the dishes, or add extra items."
        : !toSend
        ? "Everything this order requires has been sent."
        : null;

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    guests,
    servings,
    extraPercent,
    lines,
    withoutRecipe,
    draftRecipe,
    approved,
    closed,
    hasEvent: order.events.length > 0,
    canSend: blockedReason === null,
    canReturn: !closed,
    blockedReason,
    deductedAt: order.stockDeductedAt,
  };
}

/**
 * Takes the locks for anything that moves this order's stock, in the one order every order change uses (see `lockAndReadOrder`):
 * the order's menu approvals first, then the order row. So a stock send, a return, a kitchen stage change and a manual move-back
 * are serialised, and the status read afterwards is the one the winner left. Two people clicking at once cannot send twice either.
 */
async function lockOrder(tx: Prisma.TransactionClient, organizationId: string, orderId: string) {
  return lockAndReadOrder(tx, organizationId, orderId, { alsoLockOrder: true });
}

async function netSent(tx: Prisma.TransactionClient, orderId: string, inventoryId: string) {
  const rows = await tx.inventoryTransaction.groupBy({ by: ["type"], where: { orderId, inventoryId }, _sum: { quantity: true } });
  const out = Number(rows.find((r) => r.type === "STOCK_OUT")?._sum.quantity ?? 0);
  const back = Number(rows.find((r) => r.type === "STOCK_IN")?._sum.quantity ?? 0);
  return round3(out - back);
}

/**
 * Called inside the send transaction, after the order is locked. The plan the person confirmed was read before the transaction
 * started, so a recipe may have been returned to Draft (or changed, which also returns it to Draft) since. This locks every recipe
 * on the order (FOR SHARE: a status change or edit of one waits until this transaction ends, so none can slip in before the
 * commit), reads them again, and refuses unless the needs from Active recipes are exactly what was confirmed.
 */
async function assertRecipesUnchanged(tx: Prisma.TransactionClient, organizationId: string, orderId: string, plan: { servings: number; lines: { inventoryId: string; fromRecipes: number }[] }) {
  const listed = await loadPlanOrder(organizationId, orderId, tx);
  const recipeIds = [...new Set(listed?.mealPlanEntries.flatMap((entry) => entry.items.flatMap((item) => (item.menuItem?.recipe ? [item.menuItem.recipe.id] : []))) ?? [])];
  if (recipeIds.length > 0) await tx.$queryRaw`SELECT "id" FROM "recipe" WHERE "id" = ANY(${recipeIds}::text[]) FOR SHARE`;
  // Read again now that the locks are held: this sees every change that was committed before them.
  const locked = await loadPlanOrder(organizationId, orderId, tx);
  if (!locked) throw new StockTakeError("Order not found.");
  const now = new Map(aggregateNeeds(dishesOf(locked, plan.servings)).lines.map((l) => [l.inventoryId, l.needed]));
  const confirmed = new Map(plan.lines.filter((l) => l.fromRecipes > 0).map((l) => [l.inventoryId, l.fromRecipes]));
  const same = now.size === confirmed.size && [...confirmed].every(([id, quantity]) => now.get(id) !== undefined && Math.abs((now.get(id) ?? 0) - quantity) < 0.0005);
  if (!same) throw new StockTakeError("The recipes for this order changed while you were confirming (a recipe was returned to Draft or edited). Review the order and try again. Nothing was sent.");
}

/**
 * "Send items to this order": takes what is still required from the shelf and records it against the order. Only once the
 * customer has approved the menu. It can be run again after the menu or the extra items change, and then sends only the
 * difference. Where stock is short it takes what is there (never below zero) and writes the shortfall on the row.
 */
export async function sendOrderItems(organizationId: string, orderId: string, actorUserId: string) {
  const plan = await getOrderInventory(organizationId, orderId);
  if (!plan) throw new StockTakeError("Order not found.");
  if (plan.blockedReason) throw new StockTakeError(plan.blockedReason);

  const shortages: { name: string; short: number }[] = [];
  const sentLines: { name: string; quantity: number }[] = [];
  await prisma.$transaction(async (tx) => {
    const state = await lockOrder(tx, organizationId, orderId);
    // The plan above was read before the locks: the order's status is read again under them. An order moved back, cancelled or
    // completed in the meantime takes no stock.
    if (!state || !SENDABLE_STATUSES.includes(state.orderStatus) || !kitchenStarted(state.selections.map((sel) => ({ status: sel.status, stage: sel.stage })))) throw new StockTakeError("This order is no longer in preparation, so nothing was sent. Review it and try again.");
    await assertRecipesUnchanged(tx, organizationId, orderId, plan);
    for (const line of plan.lines) {
      const already = Math.max(0, await netSent(tx, orderId, line.inventoryId));
      const remaining = Math.max(0, round3(line.required - already));
      if (remaining === 0) continue;
      await tx.inventory.findFirstOrThrow({ where: { id: line.inventoryId, organizationId }, select: { id: true } });
      // Only usable stock is taken: an expired or quarantined batch is never sent to an order automatically.
      const fresh = await stockPosition(tx, line.inventoryId);
      const take = quantityToTake(remaining, fresh.usable);
      const short = round3(remaining - take);
      if (take > 0) {
        const row = await tx.inventoryTransaction.create({
          data: { inventoryId: line.inventoryId, type: "STOCK_OUT", quantity: take, orderId, actorUserId, note: short > 0 ? `${plan.orderNumber} (short by ${short} ${line.unit})` : plan.orderNumber },
        });
        try {
          await consumeStock(tx, { inventoryId: line.inventoryId, quantity: take, transactionId: row.id });
        } catch (error) {
          if (error instanceof InsufficientStockError) throw new StockTakeError("Stock changed while you were confirming. Review it and try again.");
          throw error;
        }
        sentLines.push({ name: line.name, quantity: take });
      }
      if (short > 0) shortages.push({ name: line.name, short });
    }
    // A second click that lost the race finds nothing left to send.
    if (sentLines.length === 0 && shortages.length === 0) throw new StockTakeError("Everything this order requires has been sent.");
    await tx.order.updateMany({ where: { id: orderId, organizationId, stockDeductedAt: null }, data: { stockDeductedAt: new Date(), stockDeductedByUserId: actorUserId } });
  });

  await audit({ organizationId, actorUserId, action: "order.items_sent", recordType: "Order", recordId: orderId, after: { lines: sentLines.length, shortages } });
  return { lines: sentLines.length, shortages };
}

/** Undo: puts what was sent for one item back on the shelf (a stock-in row tagged with the order). Until the order is completed. */
export async function returnOrderItem(organizationId: string, orderId: string, inventoryId: string, actorUserId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { orderNumber: true, status: true } });
  if (!order) throw new StockTakeError("Order not found.");
  const closedMessage = "This order is closed, so its items cannot be returned here. Use a Stock In on the Inventory page.";
  if (CLOSED_STATUSES.includes(order.status)) throw new StockTakeError(closedMessage);
  const item = await prisma.inventory.findFirst({ where: { id: inventoryId, organizationId }, select: { name: true, unit: true } });
  if (!item) throw new StockTakeError("Item not found.");

  const quantity = await prisma.$transaction(async (tx) => {
    const state = await lockOrder(tx, organizationId, orderId);
    if (!state || CLOSED_STATUSES.includes(state.orderStatus)) throw new StockTakeError(closedMessage); // checked again under the locks
    const sent = await netSent(tx, orderId, inventoryId);
    if (sent <= 0) throw new StockTakeError("Nothing is sent to this order for that item.");
    const row = await tx.inventoryTransaction.create({ data: { inventoryId, type: "STOCK_IN", quantity: sent, orderId, actorUserId, note: `Returned from ${order.orderNumber ?? "order"}` } });
    // Back into the batches it was taken from, at the same costs.
    await restoreOrderStock(tx, { inventoryId, orderId, quantity: sent, transactionId: row.id });
    return sent;
  });

  await audit({ organizationId, actorUserId, action: "order.item_returned", recordType: "Order", recordId: orderId, after: { item: item.name, quantity } });
  return { name: item.name, unit: item.unit, quantity };
}

/**
 * A cancelled order puts back everything that was sent to it (AJ, 2026-10-12). One stock-in row per item, tagged with the
 * order, for whatever is still out; safe to run again because it only returns the net amount still out.
 */
export async function returnAllOrderItems(organizationId: string, orderId: string, actorUserId?: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { id: true } });
  if (!order) return [];
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, organizationId, orderId);
    return returnAllOrderItemsInTransaction(tx, organizationId, orderId, actorUserId);
  });
}

/**
 * The same return inside the caller's transaction, whose locks (`lockAndReadOrder` with `alsoLockOrder`) are already held. Used by
 * `deleteOrder`, so the eligibility check, the stock coming back and the delete are one transaction: a refused or failed delete puts
 * nothing back.
 */
export async function returnAllOrderItemsInTransaction(tx: Prisma.TransactionClient, organizationId: string, orderId: string, actorUserId?: string) {
  const order = await tx.order.findFirst({ where: { id: orderId, organizationId }, select: { orderNumber: true } });
  if (!order) return [];
  const returned: { inventoryId: string; quantity: number }[] = [];
  const ids = await tx.inventoryTransaction.findMany({ where: { orderId }, distinct: ["inventoryId"], select: { inventoryId: true }, orderBy: { inventoryId: "asc" } });
  for (const { inventoryId } of ids) {
    const out = await netSent(tx, orderId, inventoryId);
    if (out <= 0) continue;
    const row = await tx.inventoryTransaction.create({ data: { inventoryId, type: "STOCK_IN", quantity: out, orderId, actorUserId: actorUserId ?? null, note: `Returned, ${order.orderNumber ?? "order"} cancelled` } });
    await restoreOrderStock(tx, { inventoryId, orderId, quantity: out, transactionId: row.id });
    returned.push({ inventoryId, quantity: out });
  }
  if (returned.length > 0) await audit({ organizationId, actorUserId, action: "order.items_returned_on_cancel", recordType: "Order", recordId: orderId, after: { items: returned.length } }, tx);
  return returned;
}

/**
 * Production planning across the board's own window (today through the Kitchen Rules' days): every order Sent to the
 * kitchen with an event in that window, its needs, and the combined shortfall for orders whose stock is not taken yet.
 */
export async function getProductionPlan(organizationId: string, locationId?: string | null) {
  const { daysBeforeEvent, extraPercent } = await getKitchenRules(organizationId);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + daysBeforeEvent + 1);

  const orders = await prisma.order.findMany({
    where: { organizationId, ...orderAt(locationId), status: "SENT_TO_KITCHEN", eventStartDate: { gte: start, lt: end } },
    orderBy: { eventStartDate: "asc" },
    include: { customer: { select: { name: true } }, ...ORDER_PLAN_INCLUDE },
  });

  const perOrder = orders.map((order) => {
    const guests = guestsFor(order);
    const servings = guests > 0 ? cookQuantity(guests, extraPercent) : 0;
    const { lines, withoutRecipe, draftRecipe } = aggregateNeeds(dishesOf(order, servings));
    return { id: order.id, orderNumber: order.orderNumber, customer: order.customer.name, eventStartDate: order.eventStartDate, guests, servings, lines, withoutRecipe, draftRecipe, taken: order.stockDeductedAt !== null };
  });

  // Combined demand from orders that have not taken their stock yet — what the shelf still has to cover.
  const open = perOrder.filter((o) => !o.taken);
  const combined = aggregateNeeds(open.flatMap((o) => o.lines.map((l) => ({ menuItemId: l.inventoryId, name: l.name, servings: 1, recipe: { yieldServings: 1, lines: [{ inventoryId: l.inventoryId, name: l.name, unit: l.unit, quantity: l.needed }] } }))));
  const stocked = withStock(combined.lines, await stockOf(organizationId, combined.lines.map((l) => l.inventoryId)));

  return { daysBeforeEvent, extraPercent, orders: perOrder, shortfalls: stocked.filter((l) => l.short > 0), totals: stocked, missingRecipe: [...new Set(perOrder.flatMap((o) => o.withoutRecipe))].sort(), draftRecipes: [...new Set(perOrder.flatMap((o) => o.draftRecipe))].sort() };
}
