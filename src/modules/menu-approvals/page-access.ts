import type { MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";
import { isPriceFrozenStatus } from "./approval-stages";

// Pure rules behind the order page's Menu Approval tab (Menu Approvals + Orders merge, Phase 2). Kept apart from the page so they can be
// tested without rendering it. None of them grants anything: the server actions and the page's own permission checks decide access.

/** Which order page a person gets: the editable one, the restricted approval view (Decision 6), or none (403 as before). */
export type OrderPageMode = "edit" | "approval-only" | "none";

export function orderPageMode(can: { editOrders: boolean; approveMenus: boolean }): OrderPageMode {
  if (can.editOrders) return "edit";
  if (can.approveMenus) return "approval-only";
  return "none";
}

/** What a viewer may do in the approval tab. Quoting a custom menu's price needs both permissions (Decision 8). */
export function approvalCapabilities(can: { editOrders: boolean; approveMenus: boolean }) {
  return { canAct: can.approveMenus, canQuotePrice: can.approveMenus && can.editOrders };
}

/** The tab ids the order page knows; anything else in `?tab=` is ignored. */
export const ORDER_TAB_IDS = ["details", "menu", "approval", "additional", "pricing", "inventory", "expenses", "staffing"] as const;

export function parseOrderTab(value: string | undefined): string | undefined {
  return value !== undefined && (ORDER_TAB_IDS as readonly string[]).includes(value) ? value : undefined;
}

/** The "not started" state of the tab: an order with no menu approval. */
export function notStartedState(order: { status: OrderStatus; eventTypeId: string | null }, can: { editOrders: boolean; approveMenus: boolean }) {
  const closed = order.status === "COMPLETED" || order.status === "CANCELLED";
  const hasEventType = order.eventTypeId !== null;
  const canStart = can.approveMenus && !closed && hasEventType;
  let reason: string | null = null;
  if (closed) reason = "This order is closed, so a menu approval can't be started.";
  else if (!hasEventType) reason = can.editOrders ? "The order needs an Event Type before a menu approval can start. Set one in Order Details and save." : "The order needs an Event Type before a menu approval can start. Ask someone who can edit the order to set one.";
  else if (!can.approveMenus) reason = "Someone who can approve menus starts it.";
  return { canStart, reason };
}

/** The menu is in front of the customer right now (sent, or being reviewed): the order's customer and event details are read-only too, not only the guests and the price. */
export function menuIsWithCustomer(selectionStatus: MenuSelectionStatus | null): boolean {
  return selectionStatus === "SENT_TO_CUSTOMER" || selectionStatus === "CUSTOMER_REVIEWING";
}

/** The order form freezes the guest counts and the pricing editor while the customer or the kitchen holds the price (Decision 14). */
export function priceIsFrozen(selectionStatus: MenuSelectionStatus | null): boolean {
  return selectionStatus !== null && isPriceFrozenStatus(selectionStatus);
}
