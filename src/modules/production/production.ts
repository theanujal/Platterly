import "server-only";
import { orderAt } from "@/modules/locations/scope";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { OrderStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit/audit";
import { getKitchenRules } from "@/modules/kitchen/kitchen-rules";
import { cookQuantity } from "@/modules/menu-approvals/kitchen-production-status";
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

async function loadPlanOrder(organizationId: string, orderId: string) {
  return prisma.order.findFirst({ where: { id: orderId, organizationId }, include: ORDER_PLAN_INCLUDE });
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
          recipe: dish.recipe
            ? { yieldServings: Number(dish.recipe.yieldServings), lines: dish.recipe.ingredients.map((i) => ({ inventoryId: i.inventoryId, name: i.inventory.name, unit: i.inventory.unit, quantity: Number(i.quantity) })) }
            : null,
        },
      ];
    }),
  );
}

async function stockOf(organizationId: string, ids: string[]) {
  const rows = await prisma.inventory.findMany({ where: { organizationId, id: { in: ids } }, select: { id: true, stockCount: true } });
  return new Map(rows.map((r) => [r.id, Number(r.stockCount)]));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
/** Items can be set once the customer has approved the menu (AJ, 2026-10-10): the order is Approved, or already with the kitchen. */
const SENDABLE_STATUSES: OrderStatus[] = ["APPROVED", "SENT_TO_KITCHEN"];
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
  const { lines: recipeLines, withoutRecipe } = aggregateNeeds(dishesOf(order, servings));

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
      const inStock = Number(item.stockCount);
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
        },
      ];
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const approved = SENDABLE_STATUSES.includes(order.status);
  const closed = CLOSED_STATUSES.includes(order.status);
  const toSend = lines.some((l) => l.remaining > 0);
  const blockedReason = closed
    ? `This order is ${order.status === "COMPLETED" ? "completed" : "cancelled"}, so items can no longer be sent.`
    : !approved
      ? "Items can be set once the customer approves the menu."
      : lines.length === 0
        ? "Nothing to send yet: add recipes to the dishes, or add extra items."
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
    approved,
    closed,
    hasEvent: order.events.length > 0,
    canSend: blockedReason === null,
    canReturn: !closed,
    blockedReason,
    deductedAt: order.stockDeductedAt,
  };
}

/** The ledger rows are written under a lock on the order, so two people clicking at once cannot send the same items twice. */
async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId} FOR UPDATE`;
}

async function netSent(tx: Prisma.TransactionClient, orderId: string, inventoryId: string) {
  const rows = await tx.inventoryTransaction.groupBy({ by: ["type"], where: { orderId, inventoryId }, _sum: { quantity: true } });
  const out = Number(rows.find((r) => r.type === "STOCK_OUT")?._sum.quantity ?? 0);
  const back = Number(rows.find((r) => r.type === "STOCK_IN")?._sum.quantity ?? 0);
  return round3(out - back);
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
    await lockOrder(tx, orderId);
    for (const line of plan.lines) {
      const already = Math.max(0, await netSent(tx, orderId, line.inventoryId));
      const remaining = Math.max(0, round3(line.required - already));
      if (remaining === 0) continue;
      const fresh = await tx.inventory.findFirstOrThrow({ where: { id: line.inventoryId, organizationId }, select: { stockCount: true } });
      const take = quantityToTake(remaining, Number(fresh.stockCount));
      const short = round3(remaining - take);
      if (take > 0) {
        const done = await tx.inventory.updateMany({ where: { id: line.inventoryId, stockCount: { gte: take } }, data: { stockCount: { decrement: take } } });
        if (done.count === 0) throw new StockTakeError("Stock changed while you were confirming. Review it and try again.");
        await tx.inventoryTransaction.create({
          data: { inventoryId: line.inventoryId, type: "STOCK_OUT", quantity: take, orderId, actorUserId, note: short > 0 ? `${plan.orderNumber} (short by ${short} ${line.unit})` : plan.orderNumber },
        });
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
  if (CLOSED_STATUSES.includes(order.status)) throw new StockTakeError("This order is closed, so its items cannot be returned here. Use a Stock In on the Inventory page.");
  const item = await prisma.inventory.findFirst({ where: { id: inventoryId, organizationId }, select: { name: true, unit: true } });
  if (!item) throw new StockTakeError("Item not found.");

  const quantity = await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const sent = await netSent(tx, orderId, inventoryId);
    if (sent <= 0) throw new StockTakeError("Nothing is sent to this order for that item.");
    await tx.inventory.update({ where: { id: inventoryId }, data: { stockCount: { increment: sent } } });
    await tx.inventoryTransaction.create({ data: { inventoryId, type: "STOCK_IN", quantity: sent, orderId, actorUserId, note: `Returned from ${order.orderNumber ?? "order"}` } });
    return sent;
  });

  await audit({ organizationId, actorUserId, action: "order.item_returned", recordType: "Order", recordId: orderId, after: { item: item.name, quantity } });
  return { name: item.name, unit: item.unit, quantity };
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
    const { lines, withoutRecipe } = aggregateNeeds(dishesOf(order, servings));
    return { id: order.id, orderNumber: order.orderNumber, customer: order.customer.name, eventStartDate: order.eventStartDate, guests, servings, lines, withoutRecipe, taken: order.stockDeductedAt !== null };
  });

  // Combined demand from orders that have not taken their stock yet — what the shelf still has to cover.
  const open = perOrder.filter((o) => !o.taken);
  const combined = aggregateNeeds(open.flatMap((o) => o.lines.map((l) => ({ menuItemId: l.inventoryId, name: l.name, servings: 1, recipe: { yieldServings: 1, lines: [{ inventoryId: l.inventoryId, name: l.name, unit: l.unit, quantity: l.needed }] } }))));
  const stocked = withStock(combined.lines, await stockOf(organizationId, combined.lines.map((l) => l.inventoryId)));

  return { daysBeforeEvent, extraPercent, orders: perOrder, shortfalls: stocked.filter((l) => l.short > 0), totals: stocked, missingRecipe: [...new Set(perOrder.flatMap((o) => o.withoutRecipe))].sort() };
}
