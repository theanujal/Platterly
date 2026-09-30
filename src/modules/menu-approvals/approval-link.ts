import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { notify } from "@/lib/notifications/notify";
import { issueToken, resolveToken } from "@/lib/secure-access/token";
import { canonicalUrl } from "@/lib/seo/canonical";
import { createEventForOrder } from "@/modules/orders/order";
import { listKitchens } from "@/modules/events/event";
import {
  addMenuApprovalNote,
  mirrorSelectionItemsFromMealPlan,
  createMenuSelection,
  customerApproves,
  customerRequestsChanges,
  recallMenu,
  sendToCustomer,
  InvalidMenuSelectionTransitionError,
} from "./menu-approval";
import type { ApprovalSnapshot } from "./approval-snapshot";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

/**
 * Team -> customer approval (AJ, 2026-09-26). The team sends the menu; each
 * send freezes a MenuVersion (snapshot) and issues a version-specific,
 * expiring, no-login link. Only the LATEST version's link can approve, and
 * only while the menu is still awaiting the customer — an old email can never
 * approve an outdated menu.
 */

/** How long an approval link stays valid. */
export const APPROVAL_LINK_DAYS = 14;

/** Statuses from which the team may send (or re-send) a menu to the customer. */
const SENDABLE_STATUSES: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];
/** The only statuses in which the customer's link may still act. */
const AWAITING_CUSTOMER: MenuSelectionStatus[] = ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"];

async function buildSnapshot(organizationId: string, orderId: string, menuSelectionId: string): Promise<ApprovalSnapshot> {
  const [order, selection] = await Promise.all([
    prisma.order.findFirstOrThrow({
      where: { id: orderId, organizationId },
      include: {
        customer: { select: { name: true } },
        eventType: { select: { name: true } },
        mealPlanEntries: { include: { menu: { select: { name: true } }, items: { orderBy: { createdAt: "asc" } } }, orderBy: [{ date: "asc" }, { mealType: "asc" }] },
        items: { where: { mealPlanEntryId: null }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.menuSelection.findFirstOrThrow({ where: { id: menuSelectionId, organizationId }, include: { items: { orderBy: { createdAt: "asc" } } } }),
  ]);

  const mealItemNames = new Set(order.mealPlanEntries.flatMap((entry) => entry.items.map((item) => item.name)));

  return {
    customerName: order.customer.name,
    eventTypeName: order.eventType?.name ?? null,
    eventStartDate: order.eventStartDate.toISOString().slice(0, 10),
    eventEndDate: order.eventEndDate.toISOString().slice(0, 10),
    venue: order.venue ?? order.eventAddress ?? null,
    guests: order.totalParticipants,
    total: Number(order.total),
    meals: order.mealPlanEntries.map((entry) => ({
      date: entry.date.toISOString().slice(0, 10),
      mealType: entry.mealType,
      menuName: entry.menu?.name ?? null,
      menuId: entry.menuId,
      price: entry.price === null ? null : Number(entry.price),
      items: entry.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        itemType: item.itemType,
        catalogId: item.menuItemId ?? item.addOnId ?? item.menuId ?? undefined,
        unitPrice: Number(item.unitPrice),
        isExtra: item.isExtra,
      })),
    })),
    // The meal plan is the source of truth now; a dish already listed under a meal isn't repeated here.
    selectedItems: [
      ...selection.items.filter((item) => !mealItemNames.has(item.name)).map((item) => ({ name: item.name, isExtra: item.isExtra })),
      ...order.items.map((item) => ({ name: item.name, isExtra: false })),
    ],
    isCustomMenu: selection.isCustomMenu,
  };
}

async function revokeVersionTokens(organizationId: string, versionIds: string[]) {
  if (versionIds.length === 0) return;
  await prisma.secureAccessToken.updateMany({
    where: { organizationId, resourceType: "MENU_APPROVAL", resourceId: { in: versionIds }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** The order's menu selection, creating its Event and MenuSelection first for an Order that has none (an admin-created Order). */
async function ensureMenuSelection(organizationId: string, orderId: string, actorUserId?: string) {
  const existing = await prisma.menuSelection.findFirst({ where: { organizationId, event: { orderId } }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;

  // createEventForOrder refuses an Order without an Event Type, with a message the caller can show as-is.
  let event = await prisma.event.findFirst({ where: { organizationId, orderId }, orderBy: { createdAt: "asc" } });
  if (!event) {
    event = await createEventForOrder(organizationId, orderId, actorUserId);
    const [defaultKitchen] = await listKitchens(organizationId);
    if (defaultKitchen) event = await prisma.event.update({ where: { id: event.id }, data: { assignedKitchenId: defaultKitchen.id } });
  }
  return createMenuSelection(organizationId, event.id);
}

/**
 * Every order with an Event Type gets its Event and a Draft MenuSelection as soon as it is saved, so it always shows up in
 * Menu Approvals (AJ, 2026-09-30), and the flat selection rows mirror its meal plan. Null for an order with no Event Type yet.
 */
export async function ensureOrderMenuSelection(organizationId: string, orderId: string, actorUserId?: string) {
  const order = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { eventTypeId: true } });
  if (!order.eventTypeId) return null;
  const selection = await ensureMenuSelection(organizationId, orderId, actorUserId);
  if (["DRAFT", "CHANGES_REQUESTED"].includes(selection.status)) {
    await mirrorSelectionItemsFromMealPlan(organizationId, selection.id);
  }
  return selection;
}

/**
 * "Send Menu for Approval" / "Send Updated Menu for Approval". Freezes the
 * order's current menu as the next version (v1, v2, …), supersedes and kills
 * the links of every earlier version, moves the order to Awaiting Customer
 * Approval and issues + logs the customer's approval link. `notify()` is log-
 * only until a provider is wired (Chunk 16), so callers should also show the
 * returned `url` to staff.
 */
export async function sendMenuForApproval(organizationId: string, target: { orderId: string } | { menuSelectionId: string }, actorUserId: string, note?: string) {
  let menuSelection;
  let orderId: string;
  if ("menuSelectionId" in target) {
    menuSelection = await prisma.menuSelection.findFirstOrThrow({ where: { id: target.menuSelectionId, organizationId }, include: { event: { select: { orderId: true } } } });
    if (!menuSelection.event.orderId) throw new InvalidMenuSelectionTransitionError("This menu isn't attached to an order.");
    orderId = menuSelection.event.orderId;
  } else {
    orderId = target.orderId;
    menuSelection = await ensureMenuSelection(organizationId, orderId, actorUserId);
  }

  if (!SENDABLE_STATUSES.includes(menuSelection.status)) {
    throw new InvalidMenuSelectionTransitionError(
      AWAITING_CUSTOMER.includes(menuSelection.status)
        ? "This menu is already with the customer. Recall it first if you need to change it."
        : "This menu has already been approved by the customer.",
    );
  }

  const previous = await prisma.menuVersion.findMany({ where: { menuSelectionId: menuSelection.id }, select: { id: true, versionNumber: true } });
  const versionNumber = previous.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
  const snapshot = await buildSnapshot(organizationId, orderId, menuSelection.id);
  const items = await prisma.menuSelectionItem.findMany({ where: { menuSelectionId: menuSelection.id } });

  const now = new Date();
  const version = await prisma.menuVersion.create({
    data: {
      menuSelectionId: menuSelection.id,
      versionNumber,
      status: "SENT_TO_CUSTOMER",
      sentAt: now,
      snapshot: JSON.parse(JSON.stringify(snapshot)),
    },
  });
  if (items.length > 0) {
    await prisma.menuVersionItem.createMany({
      data: items.map((item) => ({
        menuVersionId: version.id,
        itemType: item.itemType,
        menuId: item.menuId,
        menuItemId: item.menuItemId,
        addOnId: item.addOnId,
        name: item.name,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
      })),
    });
  }
  await prisma.menuVersion.updateMany({ where: { menuSelectionId: menuSelection.id, id: { not: version.id }, supersededAt: null }, data: { supersededAt: now } });
  await revokeVersionTokens(organizationId, previous.map((v) => v.id));

  await prisma.menuSelection.update({ where: { id: menuSelection.id }, data: { currentVersion: versionNumber } });
  await sendToCustomer(organizationId, menuSelection.id, actorUserId, versionNumber > 1);

  if (note?.trim()) {
    const author = await prisma.user.findUnique({ where: { id: actorUserId }, select: { name: true } });
    await addMenuApprovalNote(organizationId, menuSelection.id, { authorType: "TEAM", authorName: author?.name ?? null, body: note, versionNumber });
  }

  const token = await issueToken({ organizationId, resourceType: "MENU_APPROVAL", resourceId: version.id, expiresInDays: APPROVAL_LINK_DAYS });
  const url = canonicalUrl(`/menu-approval/${token.token}`);

  const customer = await prisma.customer.findFirst({ where: { organizationId, orders: { some: { id: orderId } } }, select: { name: true, email: true, phone: true } });
  await notify({
    organizationId,
    channel: "EMAIL",
    event: "menu_approval.sent",
    recipient: { email: customer?.email ?? undefined, phone: customer?.phone },
    payload: { orderId, menuSelectionId: menuSelection.id, versionNumber, customerName: customer?.name ?? "", url },
  });
  await audit({
    organizationId,
    actorUserId,
    action: "menu_selection.version_sent",
    recordType: "MenuSelection",
    recordId: menuSelection.id,
    after: { versionNumber, versionId: version.id },
  });

  return { menuSelectionId: menuSelection.id, versionId: version.id, versionNumber, url };
}

/** The live approval link for the menu's current version, or null when none is active — for staff to copy. */
export async function getActiveApprovalUrl(organizationId: string, menuSelectionId: string): Promise<string | null> {
  const selection = await prisma.menuSelection.findFirst({ where: { id: menuSelectionId, organizationId }, select: { status: true, currentVersion: true } });
  if (!selection || !AWAITING_CUSTOMER.includes(selection.status)) return null;
  const version = await prisma.menuVersion.findUnique({ where: { menuSelectionId_versionNumber: { menuSelectionId, versionNumber: selection.currentVersion } }, select: { id: true } });
  if (!version) return null;
  const token = await prisma.secureAccessToken.findFirst({
    where: {
      organizationId,
      resourceType: "MENU_APPROVAL",
      resourceId: version.id,
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
  });
  return token ? canonicalUrl(`/menu-approval/${token.token}`) : null;
}

/** Pulls a sent menu back for editing and kills its link — the customer's email stops working immediately. */
export async function recallMenuFromCustomer(organizationId: string, menuSelectionId: string, actorUserId: string) {
  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { id: menuSelectionId, organizationId } });
  const result = await recallMenu(organizationId, menuSelectionId, actorUserId);
  const versions = await prisma.menuVersion.findMany({ where: { menuSelectionId: selection.id, supersededAt: null }, select: { id: true } });
  await prisma.menuVersion.updateMany({ where: { id: { in: versions.map((v) => v.id) } }, data: { supersededAt: new Date() } });
  await revokeVersionTokens(organizationId, versions.map((v) => v.id));
  return result;
}

/**
 * Kills the live customer link(s) for a menu (the approved or recalled version's link must stop working). `supersede`
 * also marks the outstanding versions as replaced, as a recall does; without it the last approved version stays current.
 */
export async function revokeOutstandingApprovalLinks(organizationId: string, menuSelectionId: string, options?: { supersede?: boolean }) {
  const versions = await prisma.menuVersion.findMany({ where: { menuSelectionId, supersededAt: null }, select: { id: true } });
  if (options?.supersede) {
    await prisma.menuVersion.updateMany({ where: { id: { in: versions.map((v) => v.id) } }, data: { supersededAt: new Date() } });
  }
  await revokeVersionTokens(organizationId, versions.map((v) => v.id));
}

export type ResolvedApprovalLink =
  | { ok: false }
  | {
      ok: true;
      organizationId: string;
      organizationName: string;
      menuSelectionId: string;
      versionId: string;
      versionNumber: number;
      snapshot: ApprovalSnapshot;
    };

/**
 * Every check the public page and both customer actions run, in one place:
 * the token is real, unrevoked, unexpired and for a menu approval; its version
 * exists and is the CURRENT, unsuperseded one; and the menu is still awaiting
 * the customer. Any failure returns the same `{ ok: false }` — the caller can't
 * tell a wrong token from an old one from one already used (no probing).
 */
export async function resolveApprovalLink(token: string): Promise<ResolvedApprovalLink> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.resourceType !== "MENU_APPROVAL") return { ok: false };

  const version = await prisma.menuVersion.findUnique({
    where: { id: resolved.resourceId },
    include: { menuSelection: { select: { id: true, organizationId: true, status: true, currentVersion: true, organization: { select: { name: true } } } } },
  });
  if (!version || !version.snapshot) return { ok: false };

  const selection = version.menuSelection;
  if (selection.organizationId !== resolved.organizationId) return { ok: false };
  if (version.supersededAt || version.versionNumber !== selection.currentVersion) return { ok: false };
  if (!AWAITING_CUSTOMER.includes(selection.status)) return { ok: false };

  return {
    ok: true,
    organizationId: selection.organizationId,
    organizationName: selection.organization.name,
    menuSelectionId: selection.id,
    versionId: version.id,
    versionNumber: version.versionNumber,
    snapshot: version.snapshot as unknown as ApprovalSnapshot,
  };
}

/** The customer's "Approve Menu": hands the order to the kitchen team's review. */
export async function approveViaLink(token: string) {
  const link = await resolveApprovalLink(token);
  if (!link.ok) return { ok: false as const };
  await customerApproves(link.organizationId, link.menuSelectionId);
  await revokeVersionTokens(link.organizationId, [link.versionId]);
  await audit({
    organizationId: link.organizationId,
    action: "menu_selection.customer_approved_via_link",
    recordType: "MenuSelection",
    recordId: link.menuSelectionId,
    after: { versionNumber: link.versionNumber },
  });
  return { ok: true as const };
}

/** The customer's "Request Changes": back to the team as Pending Review, with their note. */
export async function requestChangesViaLink(token: string, note: string) {
  const link = await resolveApprovalLink(token);
  if (!link.ok) return { ok: false as const };
  await customerRequestsChanges(link.organizationId, link.menuSelectionId, note);
  await revokeVersionTokens(link.organizationId, [link.versionId]);
  await notify({
    organizationId: link.organizationId,
    channel: "IN_APP",
    event: "menu_approval.changes_requested",
    recipient: {},
    payload: { menuSelectionId: link.menuSelectionId, versionNumber: link.versionNumber, customerName: link.snapshot.customerName, note },
  });
  await audit({
    organizationId: link.organizationId,
    action: "menu_selection.customer_changes_requested_via_link",
    recordType: "MenuSelection",
    recordId: link.menuSelectionId,
    after: { versionNumber: link.versionNumber, note },
  });
  return { ok: true as const };
}

/** What the Order page needs to show and drive the menu-approval step, or null if the order has no menu selection yet. */
export async function getOrderMenuApproval(organizationId: string, orderId: string) {
  const selection = await prisma.menuSelection.findFirst({
    where: { organizationId, event: { orderId } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      status: true,
      kitchenProductionStatus: true,
      currentVersion: true,
      _count: { select: { versions: true } },
      versions: { orderBy: { versionNumber: "desc" }, select: { versionNumber: true, status: true, note: true, sentAt: true, supersededAt: true } },
    },
  });
  if (!selection) return null;
  return {
    versions: selection.versions,
    menuSelectionId: selection.id,
    status: selection.status,
    kitchenProductionStatus: selection.kitchenProductionStatus,
    currentVersion: selection.currentVersion,
    versionCount: selection._count.versions,
    approvalUrl: await getActiveApprovalUrl(organizationId, selection.id),
  };
}
