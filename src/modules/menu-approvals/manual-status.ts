import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { ORDER_STATUS_LABEL, MENU_SELECTION_STATUS_LABEL } from "@/modules/orders/order-status";
import { syncOrderStatus, lockMenuSelection, runHandoffTransaction } from "./menu-approval";
import { ensureOrderMenuSelection, revokeOutstandingApprovalLinks } from "./approval-link";
import { addMenuApprovalNote } from "./menu-approval";
import { recordStatusChange } from "./status-history";
import { ORDER_COMPLETED_MESSAGE } from "@/modules/orders/order-guard";
import { returnAllOrderItems } from "@/modules/production/production";
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

  // The whole change (menu approval, order, invoice, history, note, audit) is one transaction under the menu's row lock (or the
  // order's, when there is no menu approval yet). Two people setting a status at once run one after the other; the second reads
  // what the first left, so a repeated change finds "already there" and writes nothing, and a failed one leaves nothing behind.
  return runHandoffTransaction(organizationId, { recordId: orderId, actorUserId: input.actorUserId }, async (tx, afterCommit) => {
    if (selectionId) await lockMenuSelection(tx, organizationId, selectionId);
    else await tx.$queryRaw`SELECT "id" FROM "order" WHERE "id" = ${orderId} AND "organizationId" = ${organizationId} FOR UPDATE`;

    const order = await tx.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { status: true } });
    if (order.status === "COMPLETED") throw new ManualStatusChangeError(ORDER_COMPLETED_MESSAGE); // a completed order is closed

    // An order that can't have a menu approval yet (no Event Type): only its own status can be written.
    if (!selectionId) {
      if (input.target.kind !== "ORDER") throw new ManualStatusChangeError("This order has no menu approval yet.");
      if (order.status === input.target.status) return { unchanged: true as const };
      await tx.order.update({ where: { id: orderId }, data: { status: input.target.status } });
      if (input.target.status === "CANCELLED") afterCommit.push(() => returnAllOrderItems(organizationId, orderId, input.actorUserId));
      await recordStatusChange({ organizationId, orderId, subject: "ORDER", fromStatus: order.status, toStatus: input.target.status, source: "MANUAL", reason, actorUserId: input.actorUserId }, { db: tx, afterCommit });
      await audit({ organizationId, actorUserId: input.actorUserId, action: "order.status_changed_manually", recordType: "Order", recordId: orderId, before: { status: order.status }, after: { status: input.target.status, reason } }, tx);
      if (input.target.status === "SENT_TO_KITCHEN") await createInvoiceOnKitchenHandoff(organizationId, orderId, input.actorUserId, tx);
      return { unchanged: false as const };
    }

    const selection = await tx.menuSelection.findFirstOrThrow({ where: { id: selectionId, organizationId } });
    const wanted =
      input.target.kind === "ORDER"
        ? MENU_FOR_ORDER_STATUS[input.target.status]
        : { menu: input.target.status, stage: input.target.status === "FINAL_LOCKED" ? selection.kitchenProductionStatus : undefined };
    const nextStage: KitchenProductionStatus = wanted.menu === "FINAL_LOCKED" ? (wanted.stage ?? "PENDING") : "PENDING";

    if (selection.status === wanted.menu && selection.kitchenProductionStatus === nextStage && (input.target.kind === "MENU" || order.status === input.target.status)) {
      return { unchanged: true as const };
    }

    const claimed = await tx.menuSelection.updateMany({
      where: { id: selectionId, organizationId, status: selection.status, kitchenProductionStatus: selection.kitchenProductionStatus },
      data: {
        status: wanted.menu,
        kitchenProductionStatus: nextStage,
        ...(wanted.menu === "CUSTOMER_APPROVED" ? { submittedAt: selection.submittedAt ?? new Date() } : {}),
        lockedAt: wanted.menu === "FINAL_LOCKED" ? (selection.lockedAt ?? new Date()) : null,
      },
    });
    if (claimed.count === 0) throw new ManualStatusChangeError("This order was just changed by someone else. Refresh and try again.");

    // The customer's link must not outlive the status it was for. Going back to editing also retires the version that was out.
    if (wanted.menu === "DRAFT" || wanted.menu === "CHANGES_REQUESTED") await revokeOutstandingApprovalLinks(organizationId, selectionId, { supersede: true }, tx);
    else if (wanted.menu === "CUSTOMER_APPROVED" || wanted.menu === "FINAL_LOCKED") await revokeOutstandingApprovalLinks(organizationId, selectionId, undefined, tx);

    // The order follows (no separate history row for it: this manual row is the record).
    await syncOrderStatus(organizationId, selectionId, input.actorUserId, { record: false }, { db: tx, afterCommit });
    if (wanted.menu === "FINAL_LOCKED") await createInvoiceOnKitchenHandoff(organizationId, orderId, input.actorUserId, tx);
    const orderAfter = await tx.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { status: true } });

    const menuFrom = MENU_SELECTION_STATUS_LABEL[selection.status];
    const menuTo = MENU_SELECTION_STATUS_LABEL[wanted.menu];
    if (input.target.kind === "ORDER") {
      await recordStatusChange(
        {
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
        },
        { db: tx, afterCommit },
      );
    } else {
      await recordStatusChange(
        {
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
        },
        { db: tx, afterCommit },
      );
    }

    const actor = await tx.user.findUnique({ where: { id: input.actorUserId }, select: { name: true } });
    await addMenuApprovalNote(
      organizationId,
      selectionId,
      { authorType: "TEAM", authorName: actor?.name ?? null, versionNumber: selection.currentVersion, body: `Status changed by hand from ${menuFrom} to ${menuTo}. Reason: ${reason}` },
      tx,
    );
    await audit(
      {
        organizationId,
        actorUserId: input.actorUserId,
        action: "menu_selection.status_changed_manually",
        recordType: "MenuSelection",
        recordId: selectionId,
        before: { status: selection.status, kitchenProductionStatus: selection.kitchenProductionStatus, orderStatus: order.status },
        after: { status: wanted.menu, kitchenProductionStatus: nextStage, orderStatus: orderAfter.status, reason },
      },
      tx,
    );

    return { unchanged: false as const };
  });
}
