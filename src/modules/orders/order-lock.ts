import { ValidationError } from "@/lib/errors";
import type { OrderStatus } from "@/generated/prisma/enums";

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

export class OrderLockedError extends ValidationError {
  constructor() {
    super(ORDER_LOCKED_MESSAGE);
    this.name = "OrderLockedError";
  }
}
