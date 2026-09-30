import type { KitchenProductionStatus, MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";

/**
 * Order status workflow (AJ, 2026-09-26). Pure and not "server-only"-guarded:
 * the label/tone maps are used by client and server components alike, and the
 * derivation rule is unit-tested without a DB.
 *
 * Orders are the source of truth for the commercial lifecycle; Menu
 * Approvals is a work queue on top of them and the Kitchen Dashboard is the
 * fulfilment workflow. `Order.status` is *derived* from those two (see
 * `deriveOrderStatus`), written by menu-approval.ts's syncOrderStatus. A person can
 * still set it by hand (AJ, 2026-09-30), but only with a reason, through
 * menu-approval.ts's changeStatusManually, which moves the menu approval to match
 * and records the change.
 */

/**
 * Shared Badge legend (badge.tsx): neutral = not started, info = in progress, warning = needs attention, success = approved/done, danger = cancelled.
 * The accent tones (violet…orange, AJ 2026-09-27) split the "needs attention" states so they can be told apart on one card.
 */
export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "violet" | "cyan" | "pink" | "fuchsia" | "teal" | "yellow" | "orange";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_REVIEW: "Pending Review",
  AWAITING_CUSTOMER_APPROVAL: "Awaiting Customer Approval",
  APPROVED: "Approved",
  SENT_TO_KITCHEN: "Sent to Kitchen",
  COMPLETED: "Completed",
  CANCELLED: "Rejected / Cancelled",
};

export const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
  PENDING_REVIEW: "violet",
  AWAITING_CUSTOMER_APPROVAL: "info",
  APPROVED: "success",
  SENT_TO_KITCHEN: "info",
  COMPLETED: "success",
  CANCELLED: "danger",
};

/** Progress order — also the tiebreak when an Order has several menu selections. */
export const ORDER_STATUS_ORDER: OrderStatus[] = [
  "PENDING_REVIEW",
  "AWAITING_CUSTOMER_APPROVAL",
  "APPROVED",
  "SENT_TO_KITCHEN",
  "COMPLETED",
  "CANCELLED",
];

export const KITCHEN_STATUS_TONE: Record<KitchenProductionStatus, Tone> = {
  PENDING: "neutral",
  IN_PREPARATION: "teal",
  READY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
};

/** One menu selection (+ its kitchen stage once locked) -> the Order status it implies. */
export function orderStatusForSelection(selection: { status: MenuSelectionStatus; kitchenProductionStatus: KitchenProductionStatus }): OrderStatus {
  switch (selection.status) {
    // The team has to act: review a placed order, or rework it after the customer asked for changes.
    case "DRAFT":
    case "CHANGES_REQUESTED":
      return "PENDING_REVIEW";
    case "SENT_TO_CUSTOMER":
    case "CUSTOMER_REVIEWING":
      return "AWAITING_CUSTOMER_APPROVAL";
    // The customer approved; the team sends it to the kitchen next.
    case "CUSTOMER_APPROVED":
      return "APPROVED";
    case "FINAL_LOCKED":
      if (selection.kitchenProductionStatus === "DELIVERED") return "COMPLETED";
      if (selection.kitchenProductionStatus === "CANCELLED") return "CANCELLED";
      return "SENT_TO_KITCHEN";
  }
}

/**
 * An Order can own several Events, each with its own MenuSelection. The Order
 * shows the least-advanced one — that's the one still needing somebody — and
 * is only Cancelled if every selection is (a single cancelled event shouldn't
 * cancel the whole order). Null when the Order has no menu selection at all,
 * i.e. the caller should leave `Order.status` alone.
 */
export function deriveOrderStatus(selections: { status: MenuSelectionStatus; kitchenProductionStatus: KitchenProductionStatus }[]): OrderStatus | null {
  if (selections.length === 0) return null;
  const statuses = selections.map(orderStatusForSelection);
  const live = statuses.filter((s) => s !== "CANCELLED");
  if (live.length === 0) return "CANCELLED";
  return live.reduce((least, s) => (ORDER_STATUS_ORDER.indexOf(s) < ORDER_STATUS_ORDER.indexOf(least) ? s : least));
}

/** Menu Approvals work-queue labels/tones — one vocabulary for the queue, the review page and the Order page's approval panel. */
export const MENU_SELECTION_STATUS_LABEL: Record<MenuSelectionStatus, string> = {
  DRAFT: "Needs Review",
  SENT_TO_CUSTOMER: "Awaiting Customer Approval",
  CUSTOMER_REVIEWING: "Customer Reviewing",
  CHANGES_REQUESTED: "Changes Requested",
  CUSTOMER_APPROVED: "Customer Approved",
  FINAL_LOCKED: "Approved & Sent to Kitchen",
};

export const MENU_SELECTION_STATUS_TONE: Record<MenuSelectionStatus, Tone> = {
  DRAFT: "cyan",
  SENT_TO_CUSTOMER: "info",
  CUSTOMER_REVIEWING: "info",
  CHANGES_REQUESTED: "pink",
  CUSTOMER_APPROVED: "success",
  FINAL_LOCKED: "success",
};

/** The order of the menu approval statuses in a picker (workflow order). */
export const MENU_SELECTION_STATUS_ORDER: MenuSelectionStatus[] = ["DRAFT", "SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CHANGES_REQUESTED", "CUSTOMER_APPROVED", "FINAL_LOCKED"];

/** One line on what each menu approval status means, for the banner on the Order's menu tab and the Menu Approvals page. */
export const MENU_SELECTION_STATUS_HINT: Record<MenuSelectionStatus, string> = {
  DRAFT: "The team is reviewing the menu. Nothing has gone to the customer yet.",
  SENT_TO_CUSTOMER: "The menu is with the customer for approval.",
  CUSTOMER_REVIEWING: "An updated menu is with the customer for approval.",
  CHANGES_REQUESTED: "The customer asked for changes. The team updates the menu and sends it again.",
  CUSTOMER_APPROVED: "The customer approved the menu. Send it to the kitchen when everything is ready.",
  FINAL_LOCKED: "The menu is final and with the kitchen.",
};

const ORDER_STATUS_HINT: Record<OrderStatus, string> = {
  PENDING_REVIEW: "Team to review menu & items.",
  AWAITING_CUSTOMER_APPROVAL: "Menu sent to customer.",
  APPROVED: "Customer approved. Team to send it to the kitchen.",
  SENT_TO_KITCHEN: "Order sent to kitchen team.",
  COMPLETED: "Event completed successfully.",
  CANCELLED: "Order will not proceed.",
};

const KITCHEN_STAGE_HINT: Record<KitchenProductionStatus, string> = {
  PENDING: "Waiting for the kitchen to start.",
  IN_PREPARATION: "Kitchen is preparing the order.",
  READY: "Ready to leave the kitchen.",
  DELIVERED: "Delivered.",
  CANCELLED: "Kitchen will not fulfil it.",
};

// Progress order of the in-flight kitchen stages, for picking the one to show.
const KITCHEN_STAGE_ORDER: KitchenProductionStatus[] = ["PENDING", "IN_PREPARATION", "READY", "DELIVERED", "CANCELLED"];

/**
 * The one-line description shown under an Order's status in the list view. Once
 * the order is with the kitchen it reports the kitchen's own stage instead of
 * a generic line — the least-advanced one when an order has several menus.
 */
export function getOrderStatusHint(status: OrderStatus, kitchenStages: KitchenProductionStatus[] = []): string {
  if (status === "SENT_TO_KITCHEN" && kitchenStages.length > 0) {
    const current = kitchenStages.reduce((least, s) => (KITCHEN_STAGE_ORDER.indexOf(s) < KITCHEN_STAGE_ORDER.indexOf(least) ? s : least));
    return KITCHEN_STAGE_HINT[current];
  }
  return ORDER_STATUS_HINT[status];
}
