import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ORDER_STATUS_LABEL, MENU_SELECTION_STATUS_LABEL } from "@/modules/orders/order-status";
import { syncOrderStatus } from "./menu-approval";
import { ensureOrderMenuSelection, revokeOutstandingApprovalLinks } from "./approval-link";
import { addMenuApprovalNote } from "./menu-approval";
import { recordStatusChange } from "./status-history";
import { createInvoiceOnKitchenHandoff } from "@/modules/invoices/invoice";
import type { KitchenProductionStatus, MenuSelectionStatus, OrderStatus } from "@/generated/prisma/enums";

export class ManualStatusChangeError extends Error {}

export const MANUAL_REASON_MIN_LENGTH = 5;

/** What an order-level status means for the menu approval (and the kitchen stage once it is locked). */
export const MENU_FOR_ORDER_STATUS: Record<OrderStatus, { menu: MenuSelectionStatus; stage?: KitchenProductionStatus }> = {
  PENDING_REVIEW: { menu: "DRAFT" },
  AWAITING_CUSTOMER_APPROVAL: { menu: "SENT_TO_CUSTOMER" },
  APPROVED: { menu: "CUSTOMER_APPROVED" },
  SENT_TO_KITCHEN: { menu: "FINAL_LOCKED", stage: "PENDING" },
  COMPLETED: { menu: "FINAL_LOCKED", stage: "DELIVERED" },
  CANCELLED: { menu: "FINAL_LOCKED", stage: "CANCELLED" },
};

export type ManualStatusTarget = { kind: "ORDER"; status: OrderStatus } | { kind: "MENU"; status: MenuSelectionStatus };

/**
 * A person sets a status by hand (AJ, 2026-09-30) — e.g. everything was agreed with the customer over a call. It
 * skips the normal transitions but never skips the reason: it is required, kept in the status history, written to the
 * menu's Notes and to the audit log. The menu approval and the order always move together, so the sync that follows
 * every automatic change can't undo it. No customer link is created (or revived) by a manual change; the team still
 * uses "Send Menu for Approval" when the customer needs one.
 */
export async function changeStatusManually(
  organizationId: string,
  input: { menuSelectionId?: string; orderId?: string; target: ManualStatusTarget; reason: string; actorUserId: string },
) {
  const reason = input.reason.trim();
  if (reason.length < MANUAL_REASON_MIN_LENGTH) {
    throw new ManualStatusChangeError("Write a reason for the change (at least a few words), so the team can see why it was made.");
  }

  let selectionId = input.menuSelectionId ?? null;
  let orderId: string;
  if (selectionId) {
    const found = await prisma.menuSelection.findFirstOrThrow({ where: { id: selectionId, organizationId }, include: { event: { select: { orderId: true } } } });
    if (!found.event.orderId) throw new ManualStatusChangeError("This menu isn't attached to an order.");
    orderId = found.event.orderId;
  } else if (input.orderId) {
    orderId = input.orderId;
    const existing = await prisma.menuSelection.findFirst({ where: { organizationId, event: { orderId } }, orderBy: { createdAt: "asc" }, select: { id: true } });
    selectionId = existing?.id ?? (await ensureOrderMenuSelection(organizationId, orderId, input.actorUserId))?.id ?? null;
  } else {
    throw new ManualStatusChangeError("Say which order to change.");
  }

  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { status: true } });

  // An order that can't have a menu approval yet (no Event Type): only its own status can be written.
  if (!selectionId) {
    if (input.target.kind !== "ORDER") throw new ManualStatusChangeError("This order has no menu approval yet.");
    if (order.status === input.target.status) return { unchanged: true as const };
    await prisma.order.update({ where: { id: orderId }, data: { status: input.target.status } });
    await recordStatusChange({ organizationId, orderId, subject: "ORDER", fromStatus: order.status, toStatus: input.target.status, source: "MANUAL", reason, actorUserId: input.actorUserId });
    await audit({ organizationId, actorUserId: input.actorUserId, action: "order.status_changed_manually", recordType: "Order", recordId: orderId, before: { status: order.status }, after: { status: input.target.status, reason } });
    if (input.target.status === "SENT_TO_KITCHEN") await createInvoiceOnKitchenHandoff(organizationId, orderId, input.actorUserId);
    return { unchanged: false as const };
  }

  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { id: selectionId, organizationId } });
  const wanted =
    input.target.kind === "ORDER"
      ? MENU_FOR_ORDER_STATUS[input.target.status]
      : { menu: input.target.status, stage: input.target.status === "FINAL_LOCKED" ? selection.kitchenProductionStatus : undefined };
  const nextStage: KitchenProductionStatus = wanted.menu === "FINAL_LOCKED" ? (wanted.stage ?? "PENDING") : "PENDING";

  if (selection.status === wanted.menu && selection.kitchenProductionStatus === nextStage && (input.target.kind === "MENU" || order.status === input.target.status)) {
    return { unchanged: true as const };
  }

  await prisma.menuSelection.update({
    where: { id: selectionId },
    data: {
      status: wanted.menu,
      kitchenProductionStatus: nextStage,
      ...(wanted.menu === "CUSTOMER_APPROVED" ? { submittedAt: selection.submittedAt ?? new Date() } : {}),
      lockedAt: wanted.menu === "FINAL_LOCKED" ? (selection.lockedAt ?? new Date()) : null,
    },
  });

  // The customer's link must not outlive the status it was for. Going back to editing also retires the version that was out.
  if (wanted.menu === "DRAFT" || wanted.menu === "CHANGES_REQUESTED") await revokeOutstandingApprovalLinks(organizationId, selectionId, { supersede: true });
  else if (wanted.menu === "CUSTOMER_APPROVED" || wanted.menu === "FINAL_LOCKED") await revokeOutstandingApprovalLinks(organizationId, selectionId);

  // The order follows (no separate history row for it: this manual row is the record).
  await syncOrderStatus(organizationId, selectionId, input.actorUserId, { record: false });
  if (wanted.menu === "FINAL_LOCKED") await createInvoiceOnKitchenHandoff(organizationId, orderId, input.actorUserId);
  const orderAfter = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { status: true } });

  const menuFrom = MENU_SELECTION_STATUS_LABEL[selection.status];
  const menuTo = MENU_SELECTION_STATUS_LABEL[wanted.menu];
  if (input.target.kind === "ORDER") {
    await recordStatusChange({
      organizationId,
      orderId,
      menuSelectionId: selectionId,
      subject: "ORDER",
      fromStatus: order.status,
      toStatus: orderAfter.status,
      source: "MANUAL",
      trigger: `Menu approval set to ${menuTo}`,
      reason,
      actorUserId: input.actorUserId,
    });
  } else {
    await recordStatusChange({
      organizationId,
      orderId,
      menuSelectionId: selectionId,
      subject: "MENU_APPROVAL",
      fromStatus: selection.status,
      toStatus: wanted.menu,
      source: "MANUAL",
      trigger: order.status === orderAfter.status ? null : `Order is now ${ORDER_STATUS_LABEL[orderAfter.status]}`,
      reason,
      actorUserId: input.actorUserId,
    });
  }

  const actor = await prisma.user.findUnique({ where: { id: input.actorUserId }, select: { name: true } });
  await addMenuApprovalNote(organizationId, selectionId, {
    authorType: "TEAM",
    authorName: actor?.name ?? null,
    versionNumber: selection.currentVersion,
    body: `Status changed by hand from ${menuFrom} to ${menuTo}. Reason: ${reason}`,
  });
  await audit({
    organizationId,
    actorUserId: input.actorUserId,
    action: "menu_selection.status_changed_manually",
    recordType: "MenuSelection",
    recordId: selectionId,
    before: { status: selection.status, kitchenProductionStatus: selection.kitchenProductionStatus, orderStatus: order.status },
    after: { status: wanted.menu, kitchenProductionStatus: nextStage, orderStatus: orderAfter.status, reason },
  });

  return { unchanged: false as const };
}
