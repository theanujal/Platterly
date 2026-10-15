import { MENU_SELECTION_STATUS_ORDER } from "./order-status";
import type { Prisma } from "@/generated/prisma/client";
import type { MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";

/**
 * The Orders list's menu-approval filter and Past view (Menu Approvals + Orders merge, Phase 3; Decisions 2 and 9).
 * Pure (no database): `listOrders` turns these into query fragments, and the page uses the same lists for its pickers.
 */

/** An order with no menu approval yet shows as "Not Started" and can be filtered on. */
export type ApprovalFilter = "NOT_STARTED" | MenuSelectionStatus;

export const APPROVAL_FILTER_NOT_STARTED = "NOT_STARTED" as const;

/**
 * Approval work still outstanding (Decision 9): Needs Review, awaiting the customer (Sent / Reviewing), Changes Requested, and
 * Customer Approved but not yet sent to the kitchen. Final/Locked is done.
 */
export const OUTSTANDING_APPROVAL_STATUSES: readonly MenuSelectionStatus[] = ["DRAFT", "SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CHANGES_REQUESTED", "CUSTOMER_APPROVED"];

/** Orders that are over for good never carry approval work. */
export const CLOSED_ORDER_STATUSES: readonly OrderStatus[] = ["COMPLETED", "CANCELLED"];

export function parseApprovalFilter(value: string | undefined | null): ApprovalFilter | undefined {
  if (!value) return undefined;
  if (value === APPROVAL_FILTER_NOT_STARTED) return APPROVAL_FILTER_NOT_STARTED;
  return (MENU_SELECTION_STATUS_ORDER as string[]).includes(value) ? (value as MenuSelectionStatus) : undefined;
}

export type OrdersView = "upcoming" | "past";

/** Anything but an explicit `past` is the normal list, so a mistyped address never changes what the default shows. */
export function parseOrdersView(value: string | undefined | null): OrdersView {
  return value === "past" ? "past" : "upcoming";
}

/** The query fragment for the approval filter. One approval per event; an order matches when any of its events does. */
export function approvalWhere(filter: ApprovalFilter | undefined): Prisma.OrderWhereInput {
  if (!filter) return {};
  if (filter === APPROVAL_FILTER_NOT_STARTED) return { events: { none: { menuSelection: { isNot: null } } } };
  return { events: { some: { menuSelection: { is: { status: filter } } } } };
}

/** The query fragment for the Past view's rule (the event-over rule itself is `when: "past"`): approval work outstanding on an open order. */
export function outstandingApprovalWhere(): Prisma.OrderWhereInput {
  return {
    status: { notIn: [...CLOSED_ORDER_STATUSES] },
    events: { some: { menuSelection: { is: { status: { in: [...OUTSTANDING_APPROVAL_STATUSES] } } } } },
  };
}

/**
 * What the list's Menu Approval column shows for an order: the approval's status (the least advanced one when an order owns several),
 * "Not Started" when there is none, and nothing for a Completed or Cancelled order that never had one.
 */
export function approvalColumnStatus(selections: { status: MenuSelectionStatus }[], orderStatus: OrderStatus): MenuSelectionStatus | "NOT_STARTED" | null {
  if (selections.length === 0) return CLOSED_ORDER_STATUSES.includes(orderStatus) ? null : APPROVAL_FILTER_NOT_STARTED;
  return selections.reduce((least, s) => (MENU_SELECTION_STATUS_ORDER.indexOf(s.status) < MENU_SELECTION_STATUS_ORDER.indexOf(least.status) ? s : least)).status;
}
