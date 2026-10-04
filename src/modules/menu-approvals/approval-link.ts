import { createPaymentLink, sendPaymentLink } from "@/modules/payments/payment-links";
import { getPaymentSettingsView } from "@/modules/payments/payment-settings";
import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { emailPayload, loadOrderContext, notifyCustomer, onCustomerMenuAction } from "@/modules/notifications/triggers";
import { issueToken, resolveToken } from "@/lib/secure-access/token";
import { canonicalUrl } from "@/lib/seo/canonical";
import { createEventForOrder } from "@/modules/orders/order";
import { menuGuestCount, priceMeals } from "@/modules/orders/meal-pricing";
import { isValidPhone, normalizePhone } from "@/lib/phone";
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
import type { MenuSelectionStatus, VenueType } from "@/generated/prisma/enums";

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
/** Once approved the same link carries the Venue & Delivery step and then the read-only Confirmation. */
const APPROVED: MenuSelectionStatus[] = ["CUSTOMER_APPROVED", "FINAL_LOCKED"];
const LINK_LIVE_STATUSES: MenuSelectionStatus[] = [...AWAITING_CUSTOMER, ...APPROVED];
/** After approval the link has to outlive the original 14 days: the venue form can come days later. */
const APPROVED_LINK_MIN_DAYS = 30;

async function buildSnapshot(organizationId: string, orderId: string, menuSelectionId: string): Promise<ApprovalSnapshot> {
  const [order, selection] = await Promise.all([
    prisma.order.findFirstOrThrow({
      where: { id: orderId, organizationId },
      include: {
        customer: { select: { name: true } },
        eventType: { select: { name: true } },
        mealPlanEntries: {
          include: { menu: { select: { name: true, description: true, image: true, pricePerPlate: true } }, items: { orderBy: { createdAt: "asc" } } },
          orderBy: [{ date: "asc" }, { mealType: "asc" }],
        },
        items: { where: { mealPlanEntryId: null }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.menuSelection.findFirstOrThrow({ where: { id: menuSelectionId, organizationId }, include: { items: { orderBy: { createdAt: "asc" } } } }),
  ]);

  const mealItemNames = new Set(order.mealPlanEntries.flatMap((entry) => entry.items.map((item) => item.name)));

  // The category each dish sits in and each add-on's type, so the approval page can group them (2026-10-02).
  const allItems = order.mealPlanEntries.flatMap((entry) => entry.items);
  const dishIds = [...new Set(allItems.map((item) => item.menuItemId).filter((id): id is string => !!id))];
  const addOnIds = [...new Set(allItems.map((item) => item.addOnId).filter((id): id is string => !!id))];
  const [dishCategories, addOns] = await Promise.all([
    dishIds.length > 0
      ? prisma.menuItemCategory.findMany({ where: { menuItemId: { in: dishIds } }, select: { menuItemId: true, category: { select: { name: true } } }, orderBy: { createdAt: "asc" } })
      : [],
    addOnIds.length > 0 ? prisma.addOn.findMany({ where: { id: { in: addOnIds }, organizationId }, select: { id: true, type: true, priceType: true, includedInPackage: true } }) : [],
  ]);
  const categoryOfDish = new Map<string, string>();
  for (const row of dishCategories) if (!categoryOfDish.has(row.menuItemId)) categoryOfDish.set(row.menuItemId, row.category.name);
  const addOnById = new Map(addOns.map((addOn) => [addOn.id, addOn]));

  // The pieces of the total, from the very same pricing rule the order uses.
  const pricing = priceMeals(
    order.mealPlanEntries.map((entry) => ({
      price: entry.price === null ? null : Number(entry.price),
      menuPricePerPlate: entry.menu ? Number(entry.menu.pricePerPlate) : null,
      items: entry.items.map((item) => ({ itemType: item.itemType, unitPrice: Number(item.unitPrice), quantity: item.quantity, isExtra: item.isExtra })),
    })),
    order.individualPricingEnabled,
    menuGuestCount(order),
  );
  let extrasAmount = 0;
  let liveCountersAmount = 0;
  let addOnsAmount = 0;
  for (const item of allItems) {
    const amount = Number(item.unitPrice) * item.quantity;
    if (item.itemType === "ADD_ON") {
      if (item.addOnId && addOnById.get(item.addOnId)?.type === "LIVE_COUNTER") liveCountersAmount += amount;
      else addOnsAmount += amount;
    } else if (item.isExtra) extrasAmount += amount;
  }
  const childrenCharge = Number(order.childrenCharge);
  const total = Number(order.total);

  return {
    customerName: order.customer.name,
    eventTypeName: order.eventType?.name ?? null,
    eventStartDate: order.eventStartDate.toISOString().slice(0, 10),
    eventEndDate: order.eventEndDate.toISOString().slice(0, 10),
    venue: order.venue ?? order.eventAddress ?? null,
    guests: order.totalParticipants,
    total,
    meals: order.mealPlanEntries.map((entry) => ({
      date: entry.date.toISOString().slice(0, 10),
      mealType: entry.mealType,
      menuName: entry.menu?.name ?? null,
      menuId: entry.menuId,
      price: entry.price === null ? null : Number(entry.price),
      menuImage: entry.menu?.image ?? null,
      menuDescription: entry.menu?.description ?? null,
      pricePerPlate: entry.menu ? Number(entry.menu.pricePerPlate) : null,
      items: entry.items.map((item) => {
        const addOn = item.addOnId ? addOnById.get(item.addOnId) : undefined;
        return {
          name: item.name,
          quantity: item.quantity,
          itemType: item.itemType,
          catalogId: item.menuItemId ?? item.addOnId ?? item.menuId ?? undefined,
          unitPrice: Number(item.unitPrice),
          isExtra: item.isExtra,
          category: item.menuItemId ? (categoryOfDish.get(item.menuItemId) ?? null) : null,
          ...(addOn ? { addOnType: addOn.type, priceType: addOn.priceType, included: addOn.includedInPackage } : {}),
        };
      }),
    })),
    // The meal plan is the source of truth now; a dish already listed under a meal isn't repeated here.
    selectedItems: [
      ...selection.items.filter((item) => !mealItemNames.has(item.name)).map((item) => ({ name: item.name, isExtra: item.isExtra })),
      ...order.items.map((item) => ({ name: item.name, isExtra: false })),
    ],
    isCustomMenu: selection.isCustomMenu,
    breakdown: {
      menuAmount: pricing.menuAmount,
      extrasAmount,
      liveCountersAmount,
      addOnsAmount,
      childrenCharge,
      adjustments: total - (pricing.menuAmount + extrasAmount + liveCountersAmount + addOnsAmount + childrenCharge),
    },
    childBelow5Count: order.childBelow5Count ?? 0,
    child5To10Count: order.child5To10Count ?? 0,
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

  const context = await loadOrderContext(organizationId, orderId);
  await notifyCustomer({
    organizationId,
    event: "menu_approval.sent",
    email: context.customerEmail,
    phone: context.customerPhone,
    payload: emailPayload(context, { menuSelectionId: menuSelection.id, versionNumber, url }),
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

/**
 * The live link for the menu's current version, or null when none is active — for staff to copy. It stays live after
 * the customer approves (it then carries the Venue & Delivery form and the Confirmation), until the order is done.
 */
export async function getActiveApprovalUrl(organizationId: string, menuSelectionId: string): Promise<string | null> {
  const selection = await prisma.menuSelection.findFirst({ where: { id: menuSelectionId, organizationId }, select: { status: true, currentVersion: true } });
  if (!selection || !LINK_LIVE_STATUSES.includes(selection.status)) return null;
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

/** Which screen the link shows: the menu to approve, the venue form once approved, or the read-only confirmation. */
export type ApprovalLinkStage = "REVIEW" | "VENUE" | "CONFIRMATION";

export type ResolvedApprovalLink =
  | { ok: false }
  | {
      ok: true;
      stage: ApprovalLinkStage;
      organizationId: string;
      organizationName: string;
      organizationLogo: string | null;
      menuSelectionId: string;
      orderId: string | null;
      versionId: string;
      versionNumber: number;
      snapshot: ApprovalSnapshot;
      /** What the customer sent on the venue form (Confirmation), or what is already on the order to pre-fill it (Venue). */
      venue: VenueDetails;
      venueDetailsSubmittedAt: Date | null;
    };

export interface VenueDetails {
  venueType: VenueType | null;
  venueBuildingName: string;
  venueDoorNumber: string;
  venueTower: string;
  venueFloor: string;
  completeVenueAddress: string;
  venueLandmark: string;
  venueContactName: string;
  venueContactPhone: string;
  venueAccessInstructions: string;
  cookingInstructions: string;
  gasElectricAvailable: boolean;
  liveCounterAvailable: boolean;
}

/**
 * Every check the public page and the customer actions run, in one place:
 * the token is real, unrevoked, unexpired and for a menu approval; its version
 * exists and is the CURRENT, unsuperseded one; and the menu is either awaiting
 * the customer (REVIEW), approved with no venue details yet (VENUE) or approved
 * with them in (CONFIRMATION, read-only). A Completed or Cancelled order ends the
 * link. Any failure returns the same `{ ok: false }` — the caller can't tell a
 * wrong token from an old one from one already finished (no probing).
 */
export async function resolveApprovalLink(token: string): Promise<ResolvedApprovalLink> {
  const resolved = await resolveToken(token);
  if (!resolved || resolved.resourceType !== "MENU_APPROVAL") return { ok: false };

  const version = await prisma.menuVersion.findUnique({
    where: { id: resolved.resourceId },
    include: {
      menuSelection: {
        select: {
          id: true,
          organizationId: true,
          status: true,
          currentVersion: true,
          organization: { select: { name: true, logo: true } },
          event: { select: { orderId: true } },
        },
      },
    },
  });
  if (!version || !version.snapshot) return { ok: false };

  const selection = version.menuSelection;
  if (selection.organizationId !== resolved.organizationId) return { ok: false };
  if (version.supersededAt || version.versionNumber !== selection.currentVersion) return { ok: false };
  if (!LINK_LIVE_STATUSES.includes(selection.status)) return { ok: false };

  const orderId = selection.event.orderId;
  const order = orderId
    ? await prisma.order.findFirst({
        where: { id: orderId, organizationId: selection.organizationId },
        select: {
          status: true,
          venue: true,
          venueType: true,
          venueDoorNumber: true,
          venueTower: true,
          venueFloor: true,
          eventAddress: true,
          venueLandmark: true,
          venueContactName: true,
          venueContactPhone: true,
          venueAccessInstructions: true,
          cookingInstructions: true,
          gasElectricAvailable: true,
          liveCounterAvailable: true,
          venueDetailsSubmittedAt: true,
        },
      })
    : null;
  // A finished or cancelled order ends the customer's link for good.
  if (order && (order.status === "COMPLETED" || order.status === "CANCELLED")) return { ok: false };

  const submittedAt = order?.venueDetailsSubmittedAt ?? null;
  const stage: ApprovalLinkStage = AWAITING_CUSTOMER.includes(selection.status) ? "REVIEW" : submittedAt ? "CONFIRMATION" : "VENUE";

  return {
    ok: true,
    stage,
    organizationId: selection.organizationId,
    organizationName: selection.organization.name,
    organizationLogo: selection.organization.logo,
    menuSelectionId: selection.id,
    orderId,
    versionId: version.id,
    versionNumber: version.versionNumber,
    snapshot: version.snapshot as unknown as ApprovalSnapshot,
    venue: {
      venueType: order?.venueType ?? null,
      venueBuildingName: order?.venue ?? "",
      venueDoorNumber: order?.venueDoorNumber ?? "",
      venueTower: order?.venueTower ?? "",
      venueFloor: order?.venueFloor ?? "",
      completeVenueAddress: order?.eventAddress ?? "",
      venueLandmark: order?.venueLandmark ?? "",
      venueContactName: order?.venueContactName ?? "",
      venueContactPhone: order?.venueContactPhone ?? "",
      venueAccessInstructions: order?.venueAccessInstructions ?? "",
      cookingInstructions: order?.cookingInstructions ?? "",
      gasElectricAvailable: order?.gasElectricAvailable ?? false,
      liveCounterAvailable: order?.liveCounterAvailable ?? false,
    },
    venueDetailsSubmittedAt: submittedAt,
  };
}

/**
 * The customer's "Approve Menu": hands the order to the team. The link is NOT revoked any more: it now carries the
 * Venue & Delivery form, so its expiry is pushed out to give the customer time to fill it in.
 */
export async function approveViaLink(token: string) {
  const link = await resolveApprovalLink(token);
  if (!link.ok || link.stage !== "REVIEW") return { ok: false as const };
  await approveResolvedLink(link);
  return { ok: true as const };
}

async function approveResolvedLink(link: Extract<ResolvedApprovalLink, { ok: true }>) {
  await customerApproves(link.organizationId, link.menuSelectionId);
  await onCustomerMenuAction(link.organizationId, link.orderId, "approved");
  await extendApprovedLink(link.organizationId, link.versionId, link.snapshot.eventEndDate);
  await audit({
    organizationId: link.organizationId,
    action: "menu_selection.customer_approved_via_link",
    recordType: "MenuSelection",
    recordId: link.menuSelectionId,
    after: { versionNumber: link.versionNumber },
  });
}

/** Keeps the version's link alive until at least 30 days from now, or the day after the event, whichever is later. */
async function extendApprovedLink(organizationId: string, versionId: string, eventEndIso: string) {
  const day = 24 * 60 * 60 * 1000;
  const afterEvent = new Date(`${eventEndIso}T00:00:00.000Z`).getTime() + day;
  const expiresAt = new Date(Math.max(Date.now() + APPROVED_LINK_MIN_DAYS * day, Number.isNaN(afterEvent) ? 0 : afterEvent));
  await prisma.secureAccessToken.updateMany({
    where: { organizationId, resourceType: "MENU_APPROVAL", resourceId: versionId, revokedAt: null },
    data: { expiresAt },
  });
}

export interface VenueDetailsInput {
  venueType: string;
  venueBuildingName: string;
  venueDoorNumber?: string;
  venueTower?: string;
  venueFloor?: string;
  completeVenueAddress: string;
  venueLandmark?: string;
  venueContactName: string;
  venueContactPhone: string;
  venueAccessInstructions?: string;
  cookingInstructions?: string;
  gasElectricAvailable?: boolean;
  liveCounterAvailable?: boolean;
}

const VENUE_TYPES: VenueType[] = ["CLUBHOUSE", "HOTEL", "BANQUET_HALL", "RESORT", "HOME", "OFFICE", "OTHER"];
const FIELD_MAX = 1000;

/** A validation message the customer can read as-is. */
export class VenueDetailsError extends Error {}

function cleanText(value: string | undefined, label: string, required = false): string | null {
  const trimmed = value?.trim() ?? "";
  if (required && trimmed.length === 0) throw new VenueDetailsError(`${label} is required.`);
  if (trimmed.length > FIELD_MAX) throw new VenueDetailsError(`${label} is too long.`);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * The customer's Venue & Delivery form, sent on the approval link after the customer clicks Approve (a still-unapproved menu is approved by this send). Writes only the venue columns of the
 * order behind this menu, once (a second send is refused), then tells the team. The detailed fields are the ones the
 * customer used to fill in before submitting the request; Vehicle Access is not asked of the customer.
 */
export async function submitVenueViaLink(token: string, input: VenueDetailsInput) {
  const link = await resolveApprovalLink(token);
  if (!link.ok || link.stage === "CONFIRMATION" || !link.orderId) return { ok: false as const };

  if (!VENUE_TYPES.includes(input.venueType as VenueType)) throw new VenueDetailsError("Venue Type is required.");
  const phone = normalizePhone(input.venueContactPhone?.trim() ?? "");
  if (!phone) throw new VenueDetailsError("Contact Number is required.");
  if (!isValidPhone(phone)) throw new VenueDetailsError("Please enter a valid contact number for the selected country.");
  const data = {
    venueType: input.venueType as VenueType,
    venue: cleanText(input.venueBuildingName, "Venue / Building Name", true),
    venueDoorNumber: cleanText(input.venueDoorNumber, "Door / Flat / House No."),
    venueTower: cleanText(input.venueTower, "Tower / Block"),
    venueFloor: cleanText(input.venueFloor, "Floor"),
    eventAddress: cleanText(input.completeVenueAddress, "Complete Venue Address", true),
    venueLandmark: cleanText(input.venueLandmark, "Landmark"),
    venueContactName: cleanText(input.venueContactName, "Contact Person", true),
    venueContactPhone: phone,
    venueAccessInstructions: cleanText(input.venueAccessInstructions, "Loading / Access Instructions"),
    cookingInstructions: cleanText(input.cookingInstructions, "Cooking Instructions"),
    gasElectricAvailable: input.gasElectricAvailable === true,
    liveCounterAvailable: input.liveCounterAvailable === true,
  };

  // The customer's "Approve Menu" only opens this form; the approval itself is recorded here, once the details are valid.
  if (link.stage === "REVIEW") await approveResolvedLink(link);

  // Claimed in one statement so a double submit can't write twice.
  const claimed = await prisma.order.updateMany({
    where: { id: link.orderId, organizationId: link.organizationId, venueDetailsSubmittedAt: null },
    data: { ...data, venueDetailsSubmittedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false as const };

  await addMenuApprovalNote(link.organizationId, link.menuSelectionId, {
    authorType: "CUSTOMER",
    authorName: link.snapshot.customerName,
    body: "Sent the venue and delivery details.",
    versionNumber: link.versionNumber,
  });
  await onCustomerMenuAction(link.organizationId, link.orderId, "venue_details_submitted");
  await audit({
    organizationId: link.organizationId,
    action: "order.venue_details_submitted_via_link",
    recordType: "Order",
    recordId: link.orderId,
    after: { venue: data.venue, venueType: data.venueType, eventAddress: data.eventAddress },
  });
  await sendAdvancePaymentLink(link.organizationId, link.orderId);
  return { ok: true as const };
}

/**
 * The menu is final, so the customer is also sent a payment link for the advance (when the kitchen has set up
 * Razorpay or UPI). They can pay on the confirmation page right away or later from this link. Never blocks the approval.
 */
async function sendAdvancePaymentLink(organizationId: string, orderId: string) {
  try {
    const settings = await getPaymentSettingsView(organizationId);
    if (!settings.customersCanPay) return;
    const { link, url } = await createPaymentLink({ organizationId, orderId, kind: "ADVANCE" });
    await sendPaymentLink({ organizationId, orderId, url, amount: Number(link.amount) });
  } catch (error) {
    console.error("[menu-approval] advance payment link not sent", error);
  }
}

/**
 * After approving, the customer may still ask about the approved menu ("Request Menu Changes"). This only leaves a note
 * and a notification for the team: the approved menu's status is not touched, the team decides whether to reopen it.
 */
export async function askAboutApprovedMenuViaLink(token: string, note: string) {
  const link = await resolveApprovalLink(token);
  if (!link.ok || link.stage === "REVIEW") return { ok: false as const };
  await addMenuApprovalNote(link.organizationId, link.menuSelectionId, {
    authorType: "CUSTOMER",
    authorName: link.snapshot.customerName,
    body: note,
    versionNumber: link.versionNumber,
  });
  await onCustomerMenuAction(link.organizationId, link.orderId, "change_asked_after_approval", { note });
  await audit({
    organizationId: link.organizationId,
    action: "menu_selection.change_asked_after_approval_via_link",
    recordType: "MenuSelection",
    recordId: link.menuSelectionId,
    after: { versionNumber: link.versionNumber, note },
  });
  return { ok: true as const };
}

/** The customer's "Request Changes": back to the team as Pending Review, with their note. */
export async function requestChangesViaLink(token: string, note: string) {
  const link = await resolveApprovalLink(token);
  if (!link.ok || link.stage !== "REVIEW") return { ok: false as const };
  await customerRequestsChanges(link.organizationId, link.menuSelectionId, note);
  await revokeVersionTokens(link.organizationId, [link.versionId]);
  await onCustomerMenuAction(link.organizationId, link.orderId, "changes_requested", { note });
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
  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { venueDetailsSubmittedAt: true } });
  return {
    venueDetailsSubmittedAt: order?.venueDetailsSubmittedAt ?? null,
    versions: selection.versions,
    menuSelectionId: selection.id,
    status: selection.status,
    kitchenProductionStatus: selection.kitchenProductionStatus,
    currentVersion: selection.currentVersion,
    versionCount: selection._count.versions,
    approvalUrl: await getActiveApprovalUrl(organizationId, selection.id),
  };
}
