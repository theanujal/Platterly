import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { findCustomerByPhone, createCustomer } from "@/modules/customers/customer";
import {
  createOrder,
  createEventForOrder,
  resolveCatalogItem,
  recalculateOrderTotals,
  replaceMealPlanEntries,
  deriveStandardChildPricingMenuId,
  type OrderItemCatalogInput,
  type MealPlanEntryInput,
} from "@/modules/orders/order";
import { listKitchens } from "@/modules/events/event";
import { deriveOrderStatus } from "@/modules/orders/order-status";
import { recordStatusChange } from "./status-history";
import type { MenuSelectionStatus, KitchenProductionStatus, FoodType, MealType, VenueType, VehicleAccessType } from "@/generated/prisma/enums";

export class InvalidMenuSelectionTransitionError extends Error {}

// --- Group 11.2 — public intake form (no login; see dev plans/chunk-11's
// 2026-09-17 redesign). Every visitor, new or repeat customer, fills the
// same fields; a brand-new Order + Event is always created, never mapped to
// an existing one. ---

export interface EventDetailsIntakeInput {
  // Customer identification (Chunk 11 Group 11.2) — phone is the lookup key
  // (Customer.@@unique([organizationId, phone])), no OTP yet.
  name: string;
  email: string;
  phone: string;

  // Core event details.
  eventTypeId: string;
  eventDate: Date;
  guestCount: number;
  childBelow5Count?: number;
  child5To10Count?: number;
  eventMealType: MealType;
  menuPreference: FoodType;

  // Venue & Delivery Details.
  venueType?: VenueType;
  venueBuildingName?: string;
  venueDoorNumber?: string;
  venueTower?: string;
  venueFloor?: string;
  venueHallName?: string;
  completeVenueAddress?: string;
  venueLandmark?: string;
  venueContactName?: string;
  venueContactPhone?: string;
  venueLatitude?: number;
  venueLongitude?: number;
  venueAccessInstructions?: string;
  vehicleAccess?: VehicleAccessType;
  liveCounterAvailable?: boolean;
}

/**
 * Group 11.2's whole intake flow in one transaction-adjacent sequence:
 * find-or-create Customer by phone -> always a brand-new Order -> its Event
 * (auto-assigned to the org's default Kitchen) -> a DRAFT MenuSelection. The
 * menu is NOT sent to the customer here (AJ, 2026-09-26): a placed order lands
 * as Pending Review, and the team sends it for approval. No `actorUserId`
 * anywhere here — this
 * is a fully anonymous, public submission (AJ, 2026-09-17), unlike every
 * other create-Order/create-Event call site in the app.
 */
export async function submitEventDetails(organizationId: string, input: EventDetailsIntakeInput) {
  let customer = await findCustomerByPhone(organizationId, input.phone);
  if (!customer) {
    customer = await createCustomer(organizationId, { name: input.name, phone: input.phone, email: input.email });
  }

  const order = await createOrder(organizationId, {
    customerId: customer.id,
    eventTypeId: input.eventTypeId,
    eventStartDate: input.eventDate,
    eventEndDate: input.eventDate,
    venue: input.venueBuildingName,
    eventAddress: input.completeVenueAddress,
    totalParticipants: input.guestCount,
    childBelow5Count: input.childBelow5Count,
    child5To10Count: input.child5To10Count,
  });

  await prisma.order.update({
    where: { id: order.id },
    data: {
      menuPreference: input.menuPreference,
      eventMealType: input.eventMealType,
      venueType: input.venueType,
      venueDoorNumber: input.venueDoorNumber,
      venueTower: input.venueTower,
      venueFloor: input.venueFloor,
      venueHallName: input.venueHallName,
      venueLandmark: input.venueLandmark,
      venueContactName: input.venueContactName,
      venueContactPhone: input.venueContactPhone,
      venueLatitude: input.venueLatitude,
      venueLongitude: input.venueLongitude,
      venueAccessInstructions: input.venueAccessInstructions,
      vehicleAccess: input.vehicleAccess,
      liveCounterAvailable: input.liveCounterAvailable,
    },
  });

  const event = await createEventForOrder(organizationId, order.id);

  const [defaultKitchen] = await listKitchens(organizationId);
  if (defaultKitchen) {
    await prisma.event.update({ where: { id: event.id }, data: { assignedKitchenId: defaultKitchen.id } });
  }

  const menuSelection = await createMenuSelection(organizationId, event.id);

  await audit({
    organizationId,
    action: "menu_selection.intake_submitted",
    recordType: "MenuSelection",
    recordId: menuSelection.id,
    after: { customerId: customer.id, orderId: order.id, eventId: event.id },
  });

  return { customer, order, event, menuSelection };
}

// --- Group 11.3 — Approval State Machine + Versioning (PRD §29/§30) ---

// Team -> customer -> kitchen (AJ, 2026-09-30). The customer only ever answers the *latest sent version*, so
// anything that changes the menu goes back to the customer as a new version. The first send is "Awaiting Customer
// Approval", every later send "Customer Reviewing". Once the customer approves, the team locks the menu ("Approved &
// Sent to Kitchen"); to change an approved menu, recall it first. DRAFT is also where a sent menu is recalled to.
// A person can jump to any status by hand, with a reason (see manual-status.ts) — that bypasses this table.
const VALID_TRANSITIONS: Record<MenuSelectionStatus, MenuSelectionStatus[]> = {
  DRAFT: ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"],
  SENT_TO_CUSTOMER: ["CUSTOMER_REVIEWING", "CHANGES_REQUESTED", "CUSTOMER_APPROVED", "DRAFT"],
  CUSTOMER_REVIEWING: ["CHANGES_REQUESTED", "CUSTOMER_APPROVED", "DRAFT"],
  CHANGES_REQUESTED: ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"],
  CUSTOMER_APPROVED: ["FINAL_LOCKED", "DRAFT"],
  FINAL_LOCKED: [],
};

// The team may only edit a menu's items while no version of it is in front of
// the customer or locked for the kitchen — otherwise the customer would approve a
// snapshot that no longer matches what the kitchen then cooks. (To change a
// sent or approved menu, recall it to DRAFT first.)
export const EDITABLE_STATUSES: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED"];

/**
 * Recomputes an Order's status from its menu selection(s) and kitchen stage
 * (deriveOrderStatus) and writes it if it changed. Called after every menu-
 * approval / kitchen transition, so the Orders list always reflects the
 * workflow. Hand-setting a status goes through manual-status.ts instead, which moves
 * the menu approval to match so this never undoes it. No-op for an Order with no menu selection.
 * `trigger` names what caused the change in the status history; `record: false` lets a manual
 * change write its own single history row instead.
 */
export async function syncOrderStatus(organizationId: string, menuSelectionId: string, actorUserId?: string, options?: { trigger?: string; record?: boolean }) {
  const selection = await prisma.menuSelection.findFirst({
    where: { id: menuSelectionId, organizationId },
    select: { event: { select: { orderId: true } } },
  });
  const orderId = selection?.event.orderId;
  if (!orderId) return;

  const selections = await prisma.menuSelection.findMany({
    where: { organizationId, event: { orderId } },
    select: { status: true, kitchenProductionStatus: true },
  });
  const next = deriveOrderStatus(selections);
  if (!next) return;

  const order = await prisma.order.findFirst({ where: { id: orderId, organizationId }, select: { status: true } });
  if (!order || order.status === next) return;

  await prisma.order.update({ where: { id: orderId }, data: { status: next } });
  await audit({
    organizationId,
    actorUserId,
    action: "order.status_synced",
    recordType: "Order",
    recordId: orderId,
    before: { status: order.status },
    after: { status: next },
  });
  if (options?.record !== false) {
    await recordStatusChange({
      organizationId,
      orderId,
      menuSelectionId,
      subject: "ORDER",
      fromStatus: order.status,
      toStatus: next,
      source: "AUTOMATIC",
      trigger: options?.trigger ?? "Follows the menu approval",
      actorUserId,
    });
  }
}

export async function createMenuSelection(
  organizationId: string,
  eventId: string,
  options?: { chosenMenuId?: string | null; isCustomMenu?: boolean },
) {
  const menuSelection = await prisma.menuSelection.create({
    data: { organizationId, eventId, chosenMenuId: options?.chosenMenuId ?? null, isCustomMenu: options?.isCustomMenu ?? false },
  });

  await audit({
    organizationId,
    action: "menu_selection.create",
    recordType: "MenuSelection",
    recordId: menuSelection.id,
    after: JSON.parse(JSON.stringify(menuSelection)),
  });

  return menuSelection;
}

interface TransitionOptions {
  actorUserId?: string;
  note?: string;
  /** What the change is called in the status history. */
  trigger?: string;
}

async function transitionMenuSelection(organizationId: string, id: string, to: MenuSelectionStatus, action: string, options?: TransitionOptions) {
  const before = await prisma.menuSelection.findFirstOrThrow({ where: { id, organizationId } });
  if (!VALID_TRANSITIONS[before.status].includes(to)) {
    throw new InvalidMenuSelectionTransitionError(`Cannot move a MenuSelection from ${before.status} to ${to}.`);
  }

  // Every request note is kept as its own entry (AJ, 2026-09-30); the two single fields below stay for older readers.
  const noteBody = options?.note?.trim();
  if (noteBody && to === "CHANGES_REQUESTED") {
    await prisma.menuApprovalNote.create({
      data: { organizationId, menuSelectionId: id, versionNumber: before.currentVersion, authorType: "CUSTOMER", authorName: null, body: noteBody },
    });
  }

  const after = await prisma.menuSelection.update({
    where: { id },
    data: {
      status: to,
      ...(to === "CHANGES_REQUESTED" ? { customerRequestNote: options?.note ?? before.customerRequestNote } : {}),
      ...(to === "CUSTOMER_APPROVED" ? { submittedAt: before.submittedAt ?? new Date() } : {}),
      ...(to === "FINAL_LOCKED" ? { lockedAt: new Date() } : {}),
    },
  });

  await audit({
    organizationId,
    actorUserId: options?.actorUserId,
    action,
    recordType: "MenuSelection",
    recordId: id,
    before: { status: before.status },
    after: { status: after.status },
  });
  const orderId = (await prisma.event.findUnique({ where: { id: after.eventId }, select: { orderId: true } }))?.orderId;
  if (orderId) {
    await recordStatusChange({
      organizationId,
      orderId,
      menuSelectionId: id,
      subject: "MENU_APPROVAL",
      fromStatus: before.status,
      toStatus: after.status,
      source: "AUTOMATIC",
      trigger: options?.trigger ?? action,
      actorUserId: options?.actorUserId,
    });
  }
  await syncOrderStatus(organizationId, id, options?.actorUserId, { trigger: options?.trigger });

  return after;
}

/**
 * Team-triggered: DRAFT / CHANGES_REQUESTED -> SENT_TO_CUSTOMER (the first version) or CUSTOMER_REVIEWING (any later one).
 * Use approval-link.ts's sendMenuForApproval, which also freezes the version and issues the link.
 */
export async function sendToCustomer(organizationId: string, id: string, actorUserId: string, isResend = false) {
  return transitionMenuSelection(organizationId, id, isResend ? "CUSTOMER_REVIEWING" : "SENT_TO_CUSTOMER", "menu_selection.sent_to_customer", {
    actorUserId,
    trigger: isResend ? "Updated menu sent to customer" : "Menu sent to customer",
  });
}

/** Customer-triggered, via the public flow — no actorUserId, same convention as quotation.ts's customer actions. */
export async function customerRequestsChanges(organizationId: string, id: string, note?: string) {
  return transitionMenuSelection(organizationId, id, "CHANGES_REQUESTED", "menu_selection.customer_request_changes", { note, trigger: "Customer asked for changes" });
}

export async function customerResumesReviewing(organizationId: string, id: string) {
  return transitionMenuSelection(organizationId, id, "CUSTOMER_REVIEWING", "menu_selection.customer_resume_reviewing", { trigger: "Customer reviewing" });
}

/** The customer's final "Approve Menu". The menu waits as Customer Approved until the team sends it to the kitchen. */
export async function customerApproves(organizationId: string, id: string) {
  return transitionMenuSelection(organizationId, id, "CUSTOMER_APPROVED", "menu_selection.customer_approved", { trigger: "Customer approved the menu" });
}

/**
 * Pulls a menu that's out with the customer (or already approved) back to DRAFT so the team can edit
 * it (and later send a fresh version). Revoking the outstanding approval link
 * is the caller's job — see approval-link.ts's recallMenuFromCustomer.
 */
export async function recallMenu(organizationId: string, id: string, actorUserId: string) {
  return transitionMenuSelection(organizationId, id, "DRAFT", "menu_selection.recalled", { actorUserId, trigger: "Menu recalled for editing" });
}

/**
 * "Approve & Send to Kitchen" (AJ, 2026-09-30): the team's own click once the customer has approved. It locks the
 * menu, which is the hand-off to the Kitchen Dashboard (the locked selection appears there as Pending) and moves the
 * Order to Sent to Kitchen. The kitchen team only receives it; it no longer approves anything.
 */
export async function approveAndSendToKitchen(organizationId: string, id: string, actorUserId: string) {
  return transitionMenuSelection(organizationId, id, "FINAL_LOCKED", "menu_selection.approved_and_sent_to_kitchen", { actorUserId, trigger: "Approved and sent to the kitchen" });
}

/**
 * Full replacement of a MenuSelection's items (same resolve-server-side-
 * price convention as Order/Quotation's own item-replace functions). Only
 * allowed while no version is with the customer or the kitchen (see
 * EDITABLE_STATUSES) — versions are frozen snapshots taken when the menu is
 * sent, so an edit always precedes a new send rather than mutating a sent one.
 */
export type MenuSelectionItemInput = Pick<OrderItemCatalogInput, "itemType" | "catalogId"> & {
  /** Picked beyond its category's max-selection (priced price x guests). Set by the storefront submit, which derives it server-side. */
  isExtra?: boolean;
};

export async function setMenuSelectionItems(organizationId: string, menuSelectionId: string, items: MenuSelectionItemInput[], actorUserId?: string) {
  const menuSelection = await prisma.menuSelection.findFirstOrThrow({
    where: { id: menuSelectionId, organizationId },
    include: { items: true },
  });

  if (!EDITABLE_STATUSES.includes(menuSelection.status)) {
    throw new InvalidMenuSelectionTransitionError("This menu has been sent, so it can't be edited. Recall it to edit it first.");
  }

  await prisma.menuSelectionItem.deleteMany({ where: { menuSelectionId } });
  if (items.length > 0) {
    const resolved = await Promise.all(
      items.map(async (item) => ({
        menuSelectionId,
        itemType: item.itemType,
        // Menu Selection is add/remove only — quantity is never client-controlled (AJ, 2026-09-25).
        quantity: 1,
        isExtra: item.isExtra ?? false,
        ...(await resolveCatalogItem(organizationId, item.itemType, item.catalogId)),
      })),
    );
    await prisma.menuSelectionItem.createMany({ data: resolved });
  }

  await audit({
    organizationId,
    actorUserId,
    action: "menu_selection.items_update",
    recordType: "MenuSelection",
    recordId: menuSelectionId,
    after: { itemCount: items.length },
  });

  return getMenuSelection(organizationId, menuSelectionId);
}

export async function getMenuSelection(organizationId: string, id: string) {
  return prisma.menuSelection.findFirst({
    where: { id, organizationId },
    include: {
      items: true,
      chosenMenu: true,
      versions: { include: { items: true }, orderBy: { versionNumber: "desc" } },
      event: { include: { customer: true, eventType: true, assignedKitchen: true, order: true } },
    },
  });
}

/**
 * Custom Menu (Chunk 12) — the customer hand-picked dishes with no price
 * shown, so the kitchen quotes a per-plate price during review. Stored on the
 * MenuSelection for the review form to prefill, and pushed onto the Order's
 * single meal-plan entry (price x guests) so its totals reflect the quote.
 */
export async function setCustomMenuPricePerPlate(organizationId: string, menuSelectionId: string, pricePerPlate: number, actorUserId: string) {
  if (!Number.isFinite(pricePerPlate) || pricePerPlate < 0) throw new Error("Price per plate must be zero or more.");
  const selection = await prisma.menuSelection.findFirstOrThrow({
    where: { id: menuSelectionId, organizationId },
    include: { event: { include: { order: { include: { mealPlanEntries: true } } } } },
  });
  if (!selection.isCustomMenu) throw new Error("Only a Custom Menu selection takes a per-plate quote.");
  const order = selection.event.order;
  if (!order) throw new Error("This selection has no Order to price.");

  await prisma.menuSelection.update({ where: { id: menuSelectionId }, data: { customPricePerPlate: pricePerPlate } });
  const guests = order.totalParticipants ?? 0;
  for (const entry of order.mealPlanEntries) {
    await prisma.mealPlanEntry.update({ where: { id: entry.id }, data: { price: pricePerPlate * guests } });
  }
  await recalculateOrderTotals(order.id);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_selection.custom_price_set",
    recordType: "MenuSelection",
    recordId: menuSelectionId,
    after: { pricePerPlate, guests },
  });
}

export async function getMenuSelectionByEventId(organizationId: string, eventId: string) {
  return prisma.menuSelection.findFirst({ where: { eventId, organizationId }, include: { items: true } });
}

/** Group 11.5 — Kitchen Dashboard's own listing, no separate data model. */
export async function listMenuSelectionsForKitchen(organizationId: string, statuses?: MenuSelectionStatus[]) {
  return prisma.menuSelection.findMany({
    where: { organizationId, ...(statuses ? { status: { in: statuses } } : {}) },
    include: { items: true, event: { include: { customer: true, eventType: true, assignedKitchen: true } } },
    orderBy: { updatedAt: "desc" },
  });
}

// --- Group 11.5 — Kitchen Dashboard & Basic Display (PRD §33/§34) ---
// Deliberately basic/manual, not the recipe/BOM-driven production planning
// of Chunk 18: a single `kitchenProductionStatus` column on MenuSelection,
// set by the kitchen team, only once `status` has reached FINAL_LOCKED.
//
// Redesigned 2026-09-19 (AJ, live reference screenshot): the board is now a
// free-choice status dropdown (any of the 5 stages, any direction — not the
// original forward-only single-step advance) plus a `CANCELLED` stage. The
// 3 "in flight" stages (Pending/In Preparation/Ready) are the board's own 3
// columns; Delivered and Cancelled move off the board entirely and are only
// reachable via their own "Delivered Orders"/"Cancelled Orders" list pages —
// see `listKitchenProductionQueue` below, unchanged, for those.

export { KITCHEN_PRODUCTION_STATUS_LABEL, KITCHEN_PRODUCTION_BOARD_STAGES } from "./kitchen-production-status";
import { KITCHEN_PRODUCTION_BOARD_STAGES, cookQuantity } from "./kitchen-production-status";
import { getKitchenRules } from "@/modules/kitchen/kitchen-rules";

// The board's "Menu name" (bell/utensils icon, AJ's reference screenshot)
// comes from the Event Type's own assigned Menu(s), not from individual
// selected line items — a customer picking food items one at a time never
// sets `MenuSelectionItem.menuId` (that field is only for a whole-Menu line
// item type, see resolveCatalogItem in orders/order.ts), so the Event
// Type's EventTypeMenu join is the only place "which Menu is this order
// following" is actually recorded.
const KITCHEN_PRODUCTION_INCLUDE = {
  items: true,
  event: { include: { customer: true, assignedKitchen: true, order: { select: { orderNumber: true } }, eventType: { include: { menus: { include: { menu: true } } } } } },
} as const;

/** Every locked menu, nearest event first — no date window. Used by the Delivered/Cancelled list pages, and by tests. */
export async function listKitchenProductionQueue(organizationId: string, productionStatuses?: KitchenProductionStatus[]) {
  return prisma.menuSelection.findMany({
    where: {
      organizationId,
      status: "FINAL_LOCKED",
      ...(productionStatuses ? { kitchenProductionStatus: { in: productionStatuses } } : {}),
    },
    include: KITCHEN_PRODUCTION_INCLUDE,
    orderBy: { event: { startDate: "asc" } },
  });
}

/**
 * The board's own listing (AJ, 2026-09-19; Delivered added as the 4th column
 * 2026-09-30 — Cancelled is not the kitchen's concern): Pending, In
 * Preparation, Ready and Delivered, and only events happening today through the Kitchen Rules' "days before the event" (2 by default) — a kitchen
 * doesn't need to see next month's locked menus mixed in with today's
 * production. The window is computed from the current date on every call,
 * so it rolls forward on its own with no separate refresh job.
 */
export async function listKitchenProductionBoard(organizationId: string) {
  const { daysBeforeEvent } = await getKitchenRules(organizationId);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWindow = new Date(startOfToday);
  endOfWindow.setDate(endOfWindow.getDate() + daysBeforeEvent + 1); // exclusive upper bound: today + `daysBeforeEvent` full days

  return prisma.menuSelection.findMany({
    where: {
      organizationId,
      status: "FINAL_LOCKED",
      kitchenProductionStatus: { in: [...KITCHEN_PRODUCTION_BOARD_STAGES] },
      event: { startDate: { gte: startOfToday, lt: endOfWindow } },
    },
    include: KITCHEN_PRODUCTION_INCLUDE,
    orderBy: { event: { startDate: "asc" } },
  });
}

/**
 * What the kitchen has to prepare for one locked menu (AJ, 2026-09-30): the
 * order's meal plan, each meal's dishes grouped by the dish's Menu Category
 * (a dish tagged with several lands under its first, alphabetically), add-ons
 * on their own, each with the guest quantity and the quantity to cook. Read-only
 * and gated on `menus:view` by the caller — the kitchen role has no
 * `menus:approve`, so it can't use the Menu Approvals page.
 */
export async function getKitchenPrepSheet(organizationId: string, id: string) {
  const selection = await prisma.menuSelection.findFirst({
    where: { id, organizationId, status: "FINAL_LOCKED" },
    include: {
      event: {
        include: {
          customer: true,
          eventType: true,
          assignedKitchen: true,
          order: {
            include: {
              mealPlanEntries: {
                orderBy: [{ date: "asc" }, { mealType: "asc" }],
                include: {
                  menu: { select: { name: true } },
                  items: {
                    orderBy: { createdAt: "asc" },
                    include: {
                      menuItem: { select: { image: true, categories: { select: { category: { select: { name: true } } } } } },
                      addOn: { select: { image: true } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!selection) return null;

  const order = selection.event.order;
  const guests = selection.event.guestCount ?? order?.totalParticipants ?? 0;
  const { extraPercent } = await getKitchenRules(organizationId);

  const meals = (order?.mealPlanEntries ?? []).map((entry) => {
    const groups = new Map<string, { name: string; image: string | null; guestQuantity: number; cookQuantity: number }[]>();
    for (const item of entry.items) {
      const isAddOn = item.itemType === "ADD_ON";
      const category = isAddOn ? "Add-ons" : ([...(item.menuItem?.categories ?? [])].map((c) => c.category.name).sort()[0] ?? "Uncategorised");
      // A dish is cooked for every guest; an add-on for the quantity ordered (1 = one for the whole event, not buffered).
      const guestQuantity = isAddOn ? item.quantity : guests;
      const row = {
        name: item.isExtra ? `${item.name} (Extra)` : item.name,
        image: (isAddOn ? item.addOn?.image : item.menuItem?.image) ?? null,
        guestQuantity,
        cookQuantity: isAddOn && item.quantity <= 1 ? guestQuantity : cookQuantity(guestQuantity, extraPercent),
      };
      groups.set(category, [...(groups.get(category) ?? []), row]);
    }
    return {
      date: entry.date,
      mealType: entry.mealType,
      menuName: entry.menu?.name ?? null,
      // Named categories alphabetically, then Uncategorised and Add-ons last.
      categories: [...groups.entries()]
        .map(([name, items]) => ({ name, items }))
        .sort((a, b) => Number(["Uncategorised", "Add-ons"].includes(a.name)) - Number(["Uncategorised", "Add-ons"].includes(b.name)) || a.name.localeCompare(b.name)),
    };
  });

  return { selection, meals, guests, extraPercent, isMultiOrder: order?.orderKind === "MULTI", kitchenNotes: order?.kitchenNotes ?? null };
}

/**
 * Sets a locked menu selection's kitchen production stage directly to any
 * of the 5 values (AJ's explicit ask, 2026-09-19 — a free-choice dropdown,
 * not a forward-only single-step advance). Still gated on the menu
 * selection itself being FINAL_LOCKED; a no-op (same stage picked again)
 * skips the write/audit-log entirely.
 */
export async function setKitchenProductionStatus(
  organizationId: string,
  id: string,
  status: KitchenProductionStatus,
  actorUserId: string,
) {
  const before = await prisma.menuSelection.findFirstOrThrow({ where: { id, organizationId } });
  if (before.status !== "FINAL_LOCKED") {
    throw new InvalidMenuSelectionTransitionError("Only a final/locked menu selection has a kitchen production status.");
  }
  if (before.kitchenProductionStatus === status) return before;

  const after = await prisma.menuSelection.update({ where: { id }, data: { kitchenProductionStatus: status } });

  await audit({
    organizationId,
    actorUserId,
    action: "menu_selection.kitchen_production_status_change",
    recordType: "MenuSelection",
    recordId: id,
    before: { kitchenProductionStatus: before.kitchenProductionStatus },
    after: { kitchenProductionStatus: after.kitchenProductionStatus },
  });
  // Delivered completes the Order; Cancelled cancels it (see orderStatusForSelection).
  await syncOrderStatus(organizationId, id, actorUserId, { trigger: `Kitchen stage: ${status.replace("_", " ").toLowerCase()}` });

  return after;
}

// --- Menu Approvals edits the order's own meal plan (AJ, 2026-09-30) ---

/** Every note on a menu approval, oldest first. */
export async function listMenuApprovalNotes(organizationId: string, menuSelectionId: string) {
  return prisma.menuApprovalNote.findMany({ where: { organizationId, menuSelectionId }, orderBy: { createdAt: "asc" } });
}

export async function addMenuApprovalNote(
  organizationId: string,
  menuSelectionId: string,
  input: { authorType: "CUSTOMER" | "KITCHEN" | "TEAM"; authorName?: string | null; body: string; versionNumber?: number | null },
) {
  const body = input.body.trim();
  if (!body) return null;
  return prisma.menuApprovalNote.create({
    data: {
      organizationId,
      menuSelectionId,
      versionNumber: input.versionNumber ?? null,
      authorType: input.authorType,
      authorName: input.authorName ?? null,
      body,
    },
  });
}

/**
 * Rebuilds the flat MenuSelectionItem rows from the order's meal plan. The meal
 * plan is the source of truth; the flat rows are a mirror that the kitchen
 * board and older code still read. A dish repeated on several meals is listed
 * once, as an Extra if any copy is.
 */
export async function mirrorSelectionItemsFromMealPlan(organizationId: string, menuSelectionId: string) {
  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { id: menuSelectionId, organizationId }, include: { event: { select: { orderId: true } } } });
  const orderId = selection.event.orderId;
  if (!orderId) return;

  const entries = await prisma.mealPlanEntry.findMany({ where: { orderId }, include: { items: { orderBy: { createdAt: "asc" } } } });
  const merged = new Map<string, { itemType: "MENU_ITEM" | "ADD_ON"; menuItemId: string | null; addOnId: string | null; name: string; unitPrice: unknown; isExtra: boolean }>();
  for (const entry of entries) {
    for (const item of entry.items) {
      if (item.itemType !== "MENU_ITEM" && item.itemType !== "ADD_ON") continue;
      const key = `${item.itemType}:${item.menuItemId ?? item.addOnId}`;
      const found = merged.get(key);
      if (found) found.isExtra = found.isExtra || item.isExtra;
      else merged.set(key, { itemType: item.itemType, menuItemId: item.menuItemId, addOnId: item.addOnId, name: item.name, unitPrice: item.unitPrice, isExtra: item.isExtra });
    }
  }

  await prisma.$transaction([
    prisma.menuSelectionItem.deleteMany({ where: { menuSelectionId } }),
    prisma.menuSelectionItem.createMany({
      data: [...merged.values()].map((item) => ({
        menuSelectionId,
        itemType: item.itemType,
        menuItemId: item.menuItemId,
        addOnId: item.addOnId,
        name: item.name,
        unitPrice: item.unitPrice as number,
        quantity: 1,
        isExtra: item.isExtra,
      })),
    }),
  ]);
}

/**
 * The team's edit on the Menu Approvals page: replaces the order's meal plan
 * (per date and meal, each with its Menu and dishes), re-prices the order by the
 * one pricing rule, and re-mirrors the flat selection rows. Only while no version
 * is with the customer or the kitchen — recall first to change a sent menu.
 */
export async function updateMenuApprovalMealPlan(organizationId: string, menuSelectionId: string, entries: MealPlanEntryInput[], actorUserId: string) {
  const selection = await prisma.menuSelection.findFirstOrThrow({ where: { id: menuSelectionId, organizationId }, include: { event: { select: { orderId: true } } } });
  if (!EDITABLE_STATUSES.includes(selection.status)) {
    throw new InvalidMenuSelectionTransitionError("This menu is with the customer or the kitchen. Recall it before changing it.");
  }
  const orderId = selection.event.orderId;
  if (!orderId) throw new InvalidMenuSelectionTransitionError("This menu isn't attached to an order.");

  const before = await prisma.order.findFirstOrThrow({ where: { id: orderId, organizationId }, select: { total: true } });
  await replaceMealPlanEntries(organizationId, orderId, entries);
  await prisma.order.update({ where: { id: orderId }, data: { childPricingMenuId: deriveStandardChildPricingMenuId(entries) } });
  const after = await recalculateOrderTotals(orderId);
  await mirrorSelectionItemsFromMealPlan(organizationId, menuSelectionId);

  await audit({
    organizationId,
    actorUserId,
    action: "menu_selection.meal_plan_updated",
    recordType: "MenuSelection",
    recordId: menuSelectionId,
    before: { total: Number(before.total) },
    after: { total: Number(after.total), meals: entries.length },
  });
}
