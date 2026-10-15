import { ValidationError } from "@/lib/errors";
import type { MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";

/**
 * An order that has been sent to the kitchen is final (AJ, 2026-10-14): the kitchen is cooking from it, so its details,
 * meals, guests and prices can't be changed any more, and it can't be deleted. Completed orders stay that way. What
 * still works: recording payments and invoices, the kitchen's own progress, and a status change with a reason (the
 * team's way back if the send was a mistake).
 */
export const ORDER_LOCKED_STATUSES: readonly OrderStatus[] = ["SENT_TO_KITCHEN", "COMPLETED"];

export const ORDER_LOCKED_MESSAGE = "This order has been sent to the kitchen, so it can't be changed any more.";

export function isOrderLocked(status: OrderStatus): boolean {
  return ORDER_LOCKED_STATUSES.includes(status);
}

/**
 * The authoritative lock (AJ, 2026-10-16): an order is locked once it has reached the kitchen, which the order's own status
 * alone does not prove (a hand-written status, a stale read). Locked when the order is Sent to Kitchen or Completed, or when
 * any of its menu approvals is Final/Locked (the hand-off itself; this includes a Cancelled kitchen stage, a closed order).
 * Callers read both under the menu's row lock, inside the transaction that writes.
 */
export function isKitchenLocked(orderStatus: OrderStatus, selectionStatuses: readonly MenuSelectionStatus[]): boolean {
  return isOrderLocked(orderStatus) || selectionStatuses.includes("FINAL_LOCKED");
}

export class OrderLockedError extends ValidationError {
  constructor() {
    super(ORDER_LOCKED_MESSAGE);
    this.name = "OrderLockedError";
  }
}
