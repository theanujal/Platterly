import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { onOrderStatusChanged } from "@/modules/notifications/triggers";

/**
 * Status history (AJ, 2026-09-30): one row for every change of an order's or its menu approval's status.
 * Automatic changes carry a `trigger` ("Menu sent to customer"); a manual one carries the person's `reason`.
 */

export interface StatusChangeInput {
  organizationId: string;
  orderId: string;
  menuSelectionId?: string | null;
  subject: "ORDER" | "MENU_APPROVAL";
  fromStatus?: string | null;
  toStatus: string;
  source: "AUTOMATIC" | "MANUAL";
  trigger?: string | null;
  reason?: string | null;
  actorUserId?: string | null;
}

/**
 * Inside a transaction, pass its client as `db` and an `afterCommit` list: the row is written with the rest of the change, and the
 * customer notification waits in the list until the transaction has committed (a rolled-back change must tell nobody anything).
 */
export interface StatusChangeContext {
  db?: Prisma.TransactionClient | typeof prisma;
  afterCommit?: (() => Promise<unknown>)[];
}

export async function recordStatusChange(input: StatusChangeInput, context: StatusChangeContext = {}) {
  const db = context.db ?? prisma;
  const actor = input.actorUserId ? await db.user.findUnique({ where: { id: input.actorUserId }, select: { name: true } }) : null;
  const change = await db.statusChange.create({
    data: {
      organizationId: input.organizationId,
      orderId: input.orderId,
      menuSelectionId: input.menuSelectionId ?? null,
      subject: input.subject,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus,
      source: input.source,
      trigger: input.trigger ?? null,
      reason: input.reason ?? null,
      actorUserId: input.actorUserId ?? null,
      actorName: actor?.name ?? null,
    },
  });
  // The customer hears about the order's own status changes (not the menu approval's internal steps).
  if (input.subject === "ORDER") {
    const notify = () => onOrderStatusChanged(input.organizationId, input.orderId, input.toStatus, input.reason);
    if (context.afterCommit) context.afterCommit.push(notify);
    else await notify();
  }
  return change;
}

/**
 * Newest first. Pass `subject` to show one side's automatic changes (the Order page shows the order's, Menu Approvals the
 * menu's) — manual changes are always included, whichever side they were made on, since each one carries its reason.
 */
export async function listStatusChanges(organizationId: string, orderId: string, options?: { subject?: "ORDER" | "MENU_APPROVAL"; limit?: number }) {
  return prisma.statusChange.findMany({
    where: { organizationId, orderId, ...(options?.subject ? { OR: [{ subject: options.subject }, { source: "MANUAL" }] } : {}) },
    orderBy: { createdAt: "desc" },
    take: options?.limit,
  });
}
