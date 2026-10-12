import "server-only";
import { prisma } from "@/lib/db";
import { issueToken, resolveToken } from "@/lib/secure-access/token";
import { canonicalUrl } from "@/lib/seo/canonical";
import { buildApprovalView, type ApprovalMealView } from "@/modules/menu-approvals/approval-view";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { tenantTodayStart } from "@/modules/payments/payment-math";
import type { ApprovalSnapshot } from "@/modules/menu-approvals/approval-snapshot";
import type { KitchenProductionStatus, MenuSelectionStatus } from "@/generated/prisma/enums";

/**
 * Share order (AJ, 2026-10-11/12): once the customer has approved the menu, they can share a read-only page with their
 * family and team. No login, no prices, no customer phone or email. The link never expires by date: the page itself
 * checks the event's last day (India) and then says the event has ended. The customer can switch it off, which revokes
 * the link. Opens are not tracked. Built on the secure-token service (resourceId = the order id).
 */

const APPROVED: MenuSelectionStatus[] = ["CUSTOMER_APPROVED", "FINAL_LOCKED"];

export interface ShareStatus {
  label: string;
  detail: string;
}

/** The one-line live status, from where the order and the kitchen are right now. Pure. */
export function shareStatus(menuStatus: MenuSelectionStatus, kitchen: KitchenProductionStatus): ShareStatus {
  if (menuStatus !== "FINAL_LOCKED") return { label: "Menu approved", detail: "The menu is approved. We will start planning your order." };
  switch (kitchen) {
    case "IN_PREPARATION":
      return { label: "Being prepared", detail: "The kitchen is preparing the food." };
    case "READY":
      return { label: "Ready", detail: "The food is ready and will be on its way." };
    case "DELIVERED":
      return { label: "Delivered", detail: "The food has been delivered. Enjoy the event!" };
    default:
      return { label: "With the kitchen", detail: "The kitchen has the order. Preparation starts closer to the event." };
  }
}

/** What the shared page shows. Deliberately has no price, no customer phone and no customer email. */
export interface ShareView {
  kitchen: { name: string; logo: string | null; phone: string | null; email: string | null };
  hostName: string;
  eventType: string | null;
  dateText: string;
  guests: number | null;
  venue: string | null;
  meals: ApprovalMealView[];
  /** Add-ons and live counters by name only. */
  extras: { name: string; kind: "LIVE_COUNTER" | "ADD_ON" }[];
  status: ShareStatus;
}

export type ResolvedShare =
  | { ok: false }
  | { ok: true; ended: true; kitchen: { name: string; logo: string | null; phone: string | null; email: string | null } }
  | { ok: true; ended: false; view: ShareView };

/** Is the customer allowed to share this order at all: the menu is approved (or locked) and the order is still running. */
async function loadShareableOrder(organizationId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, organizationId },
    select: {
      status: true,
      eventEndDate: true,
      venue: true,
      eventAddress: true,
      customer: { select: { name: true } },
      organization: { select: { name: true, logo: true, contactPhone: true, contactEmail: true } },
      events: { select: { menuSelection: { select: { status: true, currentVersion: true, kitchenProductionStatus: true, id: true } } } },
    },
  });
  if (!order || order.status === "CANCELLED") return null;
  const selection = order.events.map((e) => e.menuSelection).find((m) => m && APPROVED.includes(m.status)) ?? null;
  if (!selection || selection.kitchenProductionStatus === "CANCELLED") return null;
  return { order, selection };
}

/** For the customer's approval page: can they share, and is a link switched on right now. */
export async function getShareState(organizationId: string, orderId: string): Promise<{ allowed: boolean; url: string | null }> {
  const shareable = await loadShareableOrder(organizationId, orderId);
  if (!shareable) return { allowed: false, url: null };
  const token = await prisma.secureAccessToken.findFirst({ where: { organizationId, resourceType: "ORDER_SHARE", resourceId: orderId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  return { allowed: true, url: token ? canonicalUrl(`/share/${token.token}`) : null };
}

/** Switches sharing on (or returns the link already on). Null when the order cannot be shared yet. */
export async function enableShare(organizationId: string, orderId: string): Promise<string | null> {
  const state = await getShareState(organizationId, orderId);
  if (!state.allowed) return null;
  if (state.url) return state.url;
  const token = await issueToken({ organizationId, resourceType: "ORDER_SHARE", resourceId: orderId });
  return canonicalUrl(`/share/${token.token}`);
}

/** Switches sharing off: the link stops working for everyone it was shared with. */
export async function disableShare(organizationId: string, orderId: string): Promise<void> {
  await prisma.secureAccessToken.updateMany({
    where: { organizationId, resourceType: "ORDER_SHARE", resourceId: orderId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * The public page's one entry point. Every failure (wrong, revoked, cancelled, menu not approved) is the same
 * `{ ok: false }`, so the page cannot be probed. An event whose last day has passed returns `ended`.
 */
export async function resolveShare(token: string, now = new Date()): Promise<ResolvedShare> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.resourceType !== "ORDER_SHARE") return { ok: false };
  const shareable = await loadShareableOrder(resolved.organizationId, resolved.resourceId);
  if (!shareable) return { ok: false };
  const { order, selection } = shareable;

  const kitchen = { name: order.organization.name, logo: order.organization.logo, phone: order.organization.contactPhone, email: order.organization.contactEmail };
  if (order.eventEndDate.getTime() < tenantTodayStart(now, await getTenantTimeZone(resolved.organizationId)).getTime()) return { ok: true, ended: true, kitchen };

  const version = await prisma.menuVersion.findUnique({ where: { menuSelectionId_versionNumber: { menuSelectionId: selection.id, versionNumber: selection.currentVersion } }, select: { snapshot: true } });
  if (!version?.snapshot) return { ok: false };
  const snapshot = version.snapshot as unknown as ApprovalSnapshot;
  const approval = buildApprovalView(snapshot);

  const venue = [order.venue, order.eventAddress].filter(Boolean).join(", ") || approval.location;
  return {
    ok: true,
    ended: false,
    view: {
      kitchen,
      hostName: order.customer.name,
      eventType: approval.eventType,
      dateText: approval.dateText,
      guests: approval.guests,
      venue,
      meals: approval.meals,
      extras: approval.addOns.filter((a) => a.kind !== "EXTRA_ITEM").map((a) => ({ name: a.name, kind: a.kind as "LIVE_COUNTER" | "ADD_ON" })),
      status: shareStatus(selection.status, selection.kitchenProductionStatus),
    },
  };
}
