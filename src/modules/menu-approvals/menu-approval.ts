import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import { findCustomerByPhone, createCustomer } from "@/modules/customers/customer";
import { createOrder, createEventForOrder, resolveCatalogItem, type OrderItemCatalogInput } from "@/modules/orders/order";
import { listKitchens } from "@/modules/events/event";
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
 * (auto-assigned to the org's default Kitchen) -> a DRAFT MenuSelection
 * auto-advanced to CUSTOMER_REVIEWING. No `actorUserId` anywhere here — this
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
  const ready = await beginCustomerSelection(organizationId, menuSelection.id);

  await audit({
    organizationId,
    action: "menu_selection.intake_submitted",
    recordType: "MenuSelection",
    recordId: menuSelection.id,
    after: { customerId: customer.id, orderId: order.id, eventId: event.id },
  });

  return { customer, order, event, menuSelection: ready };
}

// --- Group 11.3 — Approval State Machine + Versioning (PRD §29/§30) ---

const VALID_TRANSITIONS: Record<MenuSelectionStatus, MenuSelectionStatus[]> = {
  DRAFT: ["SENT_TO_CUSTOMER"],
  SENT_TO_CUSTOMER: ["CUSTOMER_REVIEWING"],
  CUSTOMER_REVIEWING: ["CHANGES_REQUESTED", "CUSTOMER_APPROVED"],
  CHANGES_REQUESTED: ["CUSTOMER_REVIEWING", "CUSTOMER_APPROVED"],
  CUSTOMER_APPROVED: ["KITCHEN_REVIEWING"],
  KITCHEN_REVIEWING: ["KITCHEN_CHANGES_REQUESTED", "KITCHEN_APPROVED"],
  KITCHEN_CHANGES_REQUESTED: ["KITCHEN_REVIEWING"],
  KITCHEN_APPROVED: ["FINAL_LOCKED"],
  FINAL_LOCKED: [],
};

// A MenuSelection's items are freely mutated in place while in any of these
// statuses. Once past them, §30 requires a MenuVersion snapshot first (see
// `setMenuSelectionItems`).
const PRE_APPROVAL_STATUSES: MenuSelectionStatus[] = ["DRAFT", "SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING", "CHANGES_REQUESTED"];

export async function createMenuSelection(organizationId: string, eventId: string) {
  const menuSelection = await prisma.menuSelection.create({ data: { organizationId, eventId } });

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
}

async function transitionMenuSelection(organizationId: string, id: string, to: MenuSelectionStatus, action: string, options?: TransitionOptions) {
  const before = await prisma.menuSelection.findFirstOrThrow({ where: { id, organizationId } });
  if (!VALID_TRANSITIONS[before.status].includes(to)) {
    throw new InvalidMenuSelectionTransitionError(`Cannot move a MenuSelection from ${before.status} to ${to}.`);
  }

  const after = await prisma.menuSelection.update({
    where: { id },
    data: {
      status: to,
      ...(to === "CHANGES_REQUESTED" ? { customerRequestNote: options?.note ?? before.customerRequestNote } : {}),
      ...(to === "KITCHEN_CHANGES_REQUESTED" ? { kitchenRequestNote: options?.note ?? before.kitchenRequestNote } : {}),
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

  return after;
}

/**
 * DRAFT -> SENT_TO_CUSTOMER -> CUSTOMER_REVIEWING in one call — there's no
 * admin "send" step in this redesign (see dev plans/chunk-11.md Group 11.3),
 * so a freshly-created MenuSelection is made available to the customer
 * immediately, as one auto-advanced sequence rather than a manual send.
 */
export async function beginCustomerSelection(organizationId: string, id: string) {
  await transitionMenuSelection(organizationId, id, "SENT_TO_CUSTOMER", "menu_selection.sent_to_customer");
  return transitionMenuSelection(organizationId, id, "CUSTOMER_REVIEWING", "menu_selection.customer_reviewing");
}

/** Customer-triggered, via the public flow — no actorUserId, same convention as quotation.ts's customer actions. */
export async function customerRequestsChanges(organizationId: string, id: string, note?: string) {
  return transitionMenuSelection(organizationId, id, "CHANGES_REQUESTED", "menu_selection.customer_request_changes", { note });
}

export async function customerResumesReviewing(organizationId: string, id: string) {
  return transitionMenuSelection(organizationId, id, "CUSTOMER_REVIEWING", "menu_selection.customer_resume_reviewing");
}

/**
 * The customer's final "Approve & Submit" — also immediately hands off to
 * the kitchen queue (CUSTOMER_APPROVED -> KITCHEN_REVIEWING) in the same
 * call, since past this point AJ's rule is the customer has no further
 * view/edit access at all; only the kitchen team acts from here.
 */
export async function customerApproves(organizationId: string, id: string) {
  await transitionMenuSelection(organizationId, id, "CUSTOMER_APPROVED", "menu_selection.customer_approved");
  return transitionMenuSelection(organizationId, id, "KITCHEN_REVIEWING", "menu_selection.kitchen_reviewing");
}

export async function kitchenRequestsChanges(organizationId: string, id: string, actorUserId: string, note?: string) {
  return transitionMenuSelection(organizationId, id, "KITCHEN_CHANGES_REQUESTED", "menu_selection.kitchen_request_changes", { actorUserId, note });
}

export async function resumeKitchenReview(organizationId: string, id: string, actorUserId: string) {
  return transitionMenuSelection(organizationId, id, "KITCHEN_REVIEWING", "menu_selection.kitchen_resume_review", { actorUserId });
}

export async function kitchenApproves(organizationId: string, id: string, actorUserId: string) {
  return transitionMenuSelection(organizationId, id, "KITCHEN_APPROVED", "menu_selection.kitchen_approved", { actorUserId });
}

export async function lockMenuSelection(organizationId: string, id: string, actorUserId: string) {
  return transitionMenuSelection(organizationId, id, "FINAL_LOCKED", "menu_selection.locked", { actorUserId });
}

/**
 * Full replacement of a MenuSelection's items (same resolve-server-side-
 * price convention as Order/Quotation's own item-replace functions). Once
 * past the pre-approval statuses, §30 requires snapshotting the *current*
 * items into a new MenuVersion before applying the change, rather than
 * mutating in place.
 */
export async function setMenuSelectionItems(organizationId: string, menuSelectionId: string, items: OrderItemCatalogInput[], actorUserId?: string) {
  const menuSelection = await prisma.menuSelection.findFirstOrThrow({
    where: { id: menuSelectionId, organizationId },
    include: { items: true },
  });

  if (!PRE_APPROVAL_STATUSES.includes(menuSelection.status)) {
    const version = await prisma.menuVersion.create({
      data: { menuSelectionId, versionNumber: menuSelection.currentVersion, status: menuSelection.status },
    });
    if (menuSelection.items.length > 0) {
      await prisma.menuVersionItem.createMany({
        data: menuSelection.items.map((item) => ({
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
    await prisma.menuSelection.update({ where: { id: menuSelectionId }, data: { currentVersion: { increment: 1 } } });
  }

  await prisma.menuSelectionItem.deleteMany({ where: { menuSelectionId } });
  if (items.length > 0) {
    const resolved = await Promise.all(
      items.map(async (item) => ({
        menuSelectionId,
        itemType: item.itemType,
        quantity: item.quantity,
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
      versions: { include: { items: true }, orderBy: { versionNumber: "desc" } },
      event: { include: { customer: true, eventType: true, assignedKitchen: true, order: true } },
    },
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
// 3 "in flight" stages (Pending/Preparing/Ready) are the board's own 3
// columns; Completed and Cancelled move off the board entirely and are only
// reachable via their own "Delivered Orders"/"Cancelled Orders" list pages —
// see `listKitchenProductionQueue` below, unchanged, for those.

export { KITCHEN_PRODUCTION_STATUS_LABEL, KITCHEN_PRODUCTION_BOARD_STAGES } from "./kitchen-production-status";
import { KITCHEN_PRODUCTION_BOARD_STAGES } from "./kitchen-production-status";

// The board's "Menu name" (bell/utensils icon, AJ's reference screenshot)
// comes from the Event Type's own assigned Menu(s), not from individual
// selected line items — a customer picking food items one at a time never
// sets `MenuSelectionItem.menuId` (that field is only for a whole-Menu line
// item type, see resolveCatalogItem in orders/order.ts), so the Event
// Type's EventTypeMenu join is the only place "which Menu is this order
// following" is actually recorded.
const KITCHEN_PRODUCTION_INCLUDE = {
  items: true,
  event: { include: { customer: true, assignedKitchen: true, eventType: { include: { menus: { include: { menu: true } } } } } },
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
 * The board's own listing (AJ, 2026-09-19): only the 3 "in flight" stages,
 * and only events happening today through 2 days from now — a kitchen
 * doesn't need to see next month's locked menus mixed in with today's
 * production. The window is computed from the current date on every call,
 * so it rolls forward on its own with no separate refresh job.
 */
export async function listKitchenProductionBoard(organizationId: string) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWindow = new Date(startOfToday);
  endOfWindow.setDate(endOfWindow.getDate() + 3); // exclusive upper bound: today + 2 full days

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

  return after;
}
