import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { isKitchenLocked, OrderLockedError } from "./order-lock";
import type { KitchenProductionStatus, MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";

/**
 * Kitchen lock helpers (AJ, 2026-10-16). Every change to an order or its approval re-reads the lock inside its own transaction,
 * after taking the menu's row lock, so a hand-off that lands a moment earlier is seen. Nothing here trusts the page, a stale status
 * or the caller's role.
 */

export interface LockedOrderState {
  orderStatus: OrderStatus;
  selections: { id: string; status: MenuSelectionStatus; stage: KitchenProductionStatus }[];
  locked: boolean;
}

/** Takes the row lock of the order's menu approvals (same lock as every approval change) and reads the order's lock state. */
/**
 * THE LOCKING STRATEGY (AJ, 2026-10-16). Every transaction that changes an order, its approval or the stock sent to it takes its row
 * locks in this one order, so none can wait on another in a circle:
 *   1. the order's menu approvals (`menu_selection`, by id),
 *   2. the order row (`order`),
 *   3. inventory rows / batches (taken inside `consumeStock` / `restoreOrderStock`).
 * A transaction takes only the steps it needs, always in this order, and reads the lock state only after its locks are held.
 * `alsoLockOrder` adds step 2 for anything that writes the order's stock or deletes the order.
 */
export async function lockAndReadOrder(tx: Prisma.TransactionClient, organizationId: string, orderId: string, options?: { alsoLockOrder?: boolean }): Promise<LockedOrderState | null> {
  const selections = await tx.$queryRaw<{ id: string; status: MenuSelectionStatus; stage: KitchenProductionStatus }[]>`
    SELECT ms."id", ms."status", ms."kitchenProductionStatus" AS "stage" FROM "menu_selection" ms JOIN "event" e ON e."id" = ms."eventId"
    WHERE e."orderId" = ${orderId} AND ms."organizationId" = ${organizationId} ORDER BY ms."id" FOR UPDATE OF ms`;
  if (options?.alsoLockOrder) await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId} AND "organizationId" = ${organizationId} FOR UPDATE`;
  const order = await tx.order.findFirst({ where: { id: orderId, organizationId }, select: { status: true } });
  if (!order) return null;
  return { orderStatus: order.status, selections, locked: isKitchenLocked(order.status, selections.map((s) => s.status)) };
}

/** Throws `OrderLockedError` when the order has reached the kitchen. Returns the state when it has not. */
export async function assertOrderNotKitchenLocked(tx: Prisma.TransactionClient, organizationId: string, orderId: string | null | undefined) {
  if (!orderId) return null;
  const state = await lockAndReadOrder(tx, organizationId, orderId);
  if (state?.locked) throw new OrderLockedError();
  return state;
}

/** Runs `work` in one transaction that holds the menu lock and has just confirmed the order is not kitchen-locked. */
export async function runWhileOrderOpen<T>(organizationId: string, orderId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await assertOrderNotKitchenLocked(tx, organizationId, orderId);
    return work(tx);
  });
}

const STARTED_STAGES: KitchenProductionStatus[] = ["IN_PREPARATION", "READY", "DELIVERED"];

export const KITCHEN_STARTED_MESSAGE =
  "The kitchen has already started on this order (it was in preparation, or stock was sent to it), so it can't be moved back. Contact the kitchen; a correction after that needs its own approved process.";

/**
 * Has the kitchen started on this order? The stage field alone can't say: the kitchen's stage dropdown is free-choice, so a
 * stage of Pending may be one the kitchen went back to. So this also reads the durable evidence (fail closed):
 *  - the current stage is In Preparation, Ready or Delivered;
 *  - the audit log shows the menu approval ever held one of those stages (the kitchen's own change, or a manual one);
 *  - stock was ever sent to the order (`stockDeductedAt`, or any stock-out row tagged with it).
 * Cooking that was never recorded in Platterly can't be seen; see the report.
 */
export async function kitchenWorkStarted(tx: Prisma.TransactionClient, organizationId: string, orderId: string, selection: { id: string; stage: KitchenProductionStatus } | null): Promise<boolean> {
  if (selection && STARTED_STAGES.includes(selection.stage)) return true;
  if (selection) {
    const rows = await tx.$queryRaw<{ one: number }[]>`
      SELECT 1 AS "one" FROM "audit_log"
      WHERE "organizationId" = ${organizationId} AND "recordType" = 'MenuSelection' AND "recordId" = ${selection.id}
        AND (("after"->>'kitchenProductionStatus') IN ('IN_PREPARATION','READY','DELIVERED') OR ("before"->>'kitchenProductionStatus') IN ('IN_PREPARATION','READY','DELIVERED'))
      LIMIT 1`;
    if (rows.length > 0) return true;
  }
  const order = await tx.order.findFirst({ where: { id: orderId, organizationId }, select: { stockDeductedAt: true } });
  if (order?.stockDeductedAt) return true;
  return (await tx.inventoryTransaction.count({ where: { orderId, type: "STOCK_OUT" } })) > 0;
}

/** Stage order for "backwards": Cancelled is a separate terminal state, not a rank. */
const STAGE_RANK: Record<KitchenProductionStatus, number> = { PENDING: 0, IN_PREPARATION: 1, READY: 2, DELIVERED: 3, CANCELLED: -1 };

/**
 * Would a manual change from (menu, stage) to (menu, stage) take a kitchen-locked order backwards: out of Final/Locked, out of
 * Cancelled, or to an earlier stage? A move to Cancelled is a close, never a way back.
 */
export function isMoveBack(from: { menu: MenuSelectionStatus; stage: KitchenProductionStatus }, to: { menu: MenuSelectionStatus; stage: KitchenProductionStatus }): boolean {
  if (from.menu !== "FINAL_LOCKED") return false;
  if (to.menu !== "FINAL_LOCKED") return true;
  if (to.stage === "CANCELLED") return false;
  if (from.stage === "CANCELLED") return true;
  return STAGE_RANK[to.stage] < STAGE_RANK[from.stage];
}
