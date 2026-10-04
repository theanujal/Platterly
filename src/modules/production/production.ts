import "server-only";
import { orderAt } from "@/modules/locations/scope";
import { prisma } from "@/lib/db";
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
  events: { select: { guestCount: true } },
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

/**
 * What one order needs from the store: every dish in its meal plan, cooked for the guests plus the kitchen's extra
 * percentage, turned into ingredient quantities through each dish's recipe, set against what is on hand.
 */
export async function getOrderStockPlan(organizationId: string, orderId: string) {
  const order = await loadPlanOrder(organizationId, orderId);
  if (!order) return null;
  const { extraPercent } = await getKitchenRules(organizationId);
  const guests = guestsFor(order);
  const servings = guests > 0 ? cookQuantity(guests, extraPercent) : 0;
  const { lines, withoutRecipe } = aggregateNeeds(dishesOf(order, servings));
  const stocked = withStock(lines, await stockOf(organizationId, lines.map((l) => l.inventoryId)));

  const taken = order.stockDeductedAt
    ? await prisma.inventoryTransaction.findMany({ where: { orderId }, orderBy: { createdAt: "asc" }, select: { quantity: true, note: true, inventory: { select: { name: true, unit: true } } } })
    : [];

  return {
    orderNumber: order.orderNumber,
    status: order.status,
    guests,
    servings,
    extraPercent,
    lines: stocked,
    withoutRecipe,
    deductedAt: order.stockDeductedAt,
    taken: taken.map((t) => ({ name: t.inventory.name, unit: t.inventory.unit, quantity: Number(t.quantity), note: t.note })),
    /** Stock is taken once, when the order is with the kitchen. */
    canTake: order.status === "SENT_TO_KITCHEN" && !order.stockDeductedAt && guests > 0 && lines.length > 0,
  };
}

/**
 * The confirmed stock take (AJ, 2026-10-04): runs once, only while the order is Sent to Kitchen. The person has seen the
 * needs and shortfalls and approved them; each ingredient is taken as a STOCK_OUT ledger row tagged with the order. Where
 * stock is short, what is on hand is taken and the shortfall is written on the row, so stock never goes below zero.
 */
export async function takeOrderStock(organizationId: string, orderId: string, actorUserId: string) {
  const plan = await getOrderStockPlan(organizationId, orderId);
  if (!plan) throw new StockTakeError("Order not found.");
  if (plan.deductedAt) throw new StockTakeError("Stock for this order has already been taken.");
  if (plan.status !== "SENT_TO_KITCHEN") throw new StockTakeError("Stock is taken when the order is sent to the kitchen.");
  if (plan.guests <= 0) throw new StockTakeError("Add the guest count to the order first.");
  if (plan.lines.length === 0) throw new StockTakeError("None of this order's dishes has a recipe, so there is nothing to take.");

  const shortages: { name: string; short: number }[] = [];
  await prisma.$transaction(async (tx) => {
    // One winner: a second click or a second person finds this already set.
    const claimed = await tx.order.updateMany({ where: { id: orderId, organizationId, stockDeductedAt: null }, data: { stockDeductedAt: new Date(), stockDeductedByUserId: actorUserId } });
    if (claimed.count === 0) throw new StockTakeError("Stock for this order has already been taken.");

    for (const line of plan.lines) {
      const fresh = await tx.inventory.findFirstOrThrow({ where: { id: line.inventoryId, organizationId }, select: { stockCount: true } });
      const take = quantityToTake(line.needed, Number(fresh.stockCount));
      const short = Math.round((line.needed - take) * 1000) / 1000;
      if (take > 0) {
        const done = await tx.inventory.updateMany({ where: { id: line.inventoryId, stockCount: { gte: take } }, data: { stockCount: { decrement: take } } });
        if (done.count === 0) throw new StockTakeError("Stock changed while you were confirming. Review it and try again.");
        await tx.inventoryTransaction.create({
          data: { inventoryId: line.inventoryId, type: "STOCK_OUT", quantity: take, orderId, actorUserId, note: short > 0 ? `${plan.orderNumber} (short by ${short} ${line.unit})` : plan.orderNumber },
        });
      }
      if (short > 0) shortages.push({ name: line.name, short });
    }
  });

  await audit({
    organizationId,
    actorUserId,
    action: "order.stock_taken",
    recordType: "Order",
    recordId: orderId,
    after: { lines: plan.lines.length, shortages },
  });
  return { lines: plan.lines.length, shortages };
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
