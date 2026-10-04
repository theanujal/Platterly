import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { isMultiLocationEnabled } from "./locations";

export const ACTIVE_LOCATION_COOKIE = "active_location";

export interface ActiveLocation {
  /** Multiple locations are switched on (and the plan allows it). False means no location filtering anywhere. */
  enabled: boolean;
  /** The location every list is limited to, or null for all locations. */
  locationId: string | null;
  /** The person is assigned to a location, so they cannot switch away from it. */
  locked: boolean;
  /** The owner is the only one who sees the switcher. */
  canSwitch: boolean;
}

const OFF: ActiveLocation = { enabled: false, locationId: null, locked: false, canSwitch: false };

/**
 * Chunk 23 — which location the signed-in person is looking at. Someone assigned to a location is held to it; the
 * owner picks one in the header (a cookie, "all locations" by default); everyone else with no location sees the
 * whole kitchen. Always resolved on the server from the session's own organization.
 */
export const getActiveLocation = cache(async (organizationId: string, userId: string): Promise<ActiveLocation> => {
  if (!(await isMultiLocationEnabled(organizationId))) return OFF;
  const member = await prisma.member.findFirst({ where: { organizationId, userId }, select: { role: true, locationId: true } });
  if (member?.locationId) return { enabled: true, locationId: member.locationId, locked: true, canSwitch: false };
  const canSwitch = member?.role === "owner";
  if (!canSwitch) return { enabled: true, locationId: null, locked: false, canSwitch: false };
  const wanted = (await cookies()).get(ACTIVE_LOCATION_COOKIE)?.value;
  // A cookie from another kitchen (or a deleted location) is ignored, never trusted.
  const valid = wanted ? await prisma.kitchen.findFirst({ where: { id: wanted, organizationId }, select: { id: true } }) : null;
  return { enabled: true, locationId: valid?.id ?? null, locked: false, canSwitch };
});

/** The location the person is held to (assigned to it), or null: not held, or locations are off. */
async function heldLocation(organizationId: string, userId: string): Promise<string | null> {
  const active = await getActiveLocation(organizationId, userId);
  return active.locked ? active.locationId : null;
}

/**
 * A person held to a location may only open records at that location, even by typing the address. An order belongs to
 * the location of its events (the same rule the Orders list filters on). Anyone not held sees everything.
 */
export async function orderAtMyLocation(organizationId: string, userId: string, orderId: string | null | undefined): Promise<boolean> {
  const held = await heldLocation(organizationId, userId);
  if (!held) return true;
  if (!orderId) return false;
  return (await prisma.order.count({ where: { id: orderId, organizationId, events: { some: { assignedKitchenId: held } } } })) > 0;
}

/** Same, for a record that carries its event's location directly (a menu selection, an event). */
export async function kitchenAtMyLocation(organizationId: string, userId: string, assignedKitchenId: string | null | undefined): Promise<boolean> {
  const held = await heldLocation(organizationId, userId);
  return !held || held === assignedKitchenId;
}

/** A purchase order tied to a location opens only there; one tied to none opens everywhere. */
export async function assertSharedOrAtMyLocation(organizationId: string, userId: string, kitchenId: string | null | undefined): Promise<void> {
  const held = await heldLocation(organizationId, userId);
  if (held && kitchenId && kitchenId !== held) notFound();
}

/** Pages: an address outside the person's location is a plain 404. */
export async function assertOrderAtMyLocation(organizationId: string, userId: string, orderId: string | null | undefined): Promise<void> {
  if (!(await orderAtMyLocation(organizationId, userId, orderId))) notFound();
}

export async function assertKitchenAtMyLocation(organizationId: string, userId: string, assignedKitchenId: string | null | undefined): Promise<void> {
  if (!(await kitchenAtMyLocation(organizationId, userId, assignedKitchenId))) notFound();
}

// --- Server Actions (Chunk 23) -------------------------------------------------------------------------------------
// A Server Action is an open HTTP endpoint, so a held member's limit has to hold for a hand-made call with another
// location's id too, not only for the pages that link to it. Each helper below turns the id the action received into
// the location of the record it belongs to, and answers 404 when that is outside the member's location. They all
// return at once for anyone who is not held, so the extra lookup only happens for the people it applies to.

/** The held member's own location, or null; for an action that must keep a record where it is. */
export const myHeldLocation = heldLocation;

async function inHeld(organizationId: string, userId: string, allowed: (held: string) => Promise<boolean>): Promise<void> {
  const held = await heldLocation(organizationId, userId);
  if (held && !(await allowed(held))) notFound();
}

const orderIs = (organizationId: string, orderId: string, held: string) =>
  prisma.order.count({ where: { id: orderId, organizationId, events: { some: { assignedKitchenId: held } } } }).then((n) => n > 0);

export const assertEventAtMyLocationById = (organizationId: string, userId: string, eventId: string | null | undefined) =>
  inHeld(organizationId, userId, async (held) => (eventId ? (await prisma.event.count({ where: { id: eventId, organizationId, assignedKitchenId: held } })) > 0 : false));

export const assertMenuSelectionAtMyLocation = (organizationId: string, userId: string, selectionId: string) =>
  inHeld(organizationId, userId, async (held) => (await prisma.menuSelection.count({ where: { id: selectionId, organizationId, event: { assignedKitchenId: held } } })) > 0);

export const assertInvoiceAtMyLocation = (organizationId: string, userId: string, invoiceId: string) =>
  inHeld(organizationId, userId, async (held) => {
    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, organizationId }, select: { orderId: true } });
    return invoice ? orderIs(organizationId, invoice.orderId, held) : false;
  });

export const assertPaymentAtMyLocation = (organizationId: string, userId: string, paymentId: string) =>
  inHeld(organizationId, userId, async (held) => {
    const payment = await prisma.payment.findFirst({ where: { id: paymentId, organizationId }, select: { orderId: true } });
    return payment ? orderIs(organizationId, payment.orderId, held) : false;
  });

/** An expense of an order follows the order; a company expense has no location, so anyone may touch it. */
export const assertExpenseAtMyLocation = (organizationId: string, userId: string, expenseId: string) =>
  inHeld(organizationId, userId, async (held) => {
    const expense = await prisma.expense.findFirst({ where: { id: expenseId, organizationId }, select: { orderId: true } });
    return expense ? (expense.orderId ? orderIs(organizationId, expense.orderId, held) : true) : false;
  });

export const assertExpenseAttachmentAtMyLocation = (organizationId: string, userId: string, attachmentId: string) =>
  inHeld(organizationId, userId, async (held) => {
    const attachment = await prisma.expenseAttachment.findFirst({ where: { id: attachmentId, organizationId }, select: { expense: { select: { orderId: true } } } });
    return attachment ? (attachment.expense.orderId ? orderIs(organizationId, attachment.expense.orderId, held) : true) : false;
  });

export const assertStaffAssignmentAtMyLocation = (organizationId: string, userId: string, assignmentId: string) =>
  inHeld(organizationId, userId, async (held) => (await prisma.staffAssignment.count({ where: { id: assignmentId, organizationId, event: { assignedKitchenId: held } } })) > 0);

export const assertEventTaskAtMyLocation = (organizationId: string, userId: string, taskId: string) =>
  inHeld(organizationId, userId, async (held) => (await prisma.eventTask.count({ where: { id: taskId, organizationId, event: { assignedKitchenId: held } } })) > 0);

/** A purchase order tied to a location opens only there; one tied to none opens everywhere. */
export const assertPurchaseOrderAtMyLocationById = (organizationId: string, userId: string, id: string) =>
  inHeld(organizationId, userId, async (held) => (await prisma.purchaseOrder.count({ where: { id, organizationId, OR: [{ kitchenId: null }, { kitchenId: held }] } })) > 0);

/** An inventory item at the member's location, or shared by every location. */
export const assertInventoryItemAtMyLocation = (organizationId: string, userId: string, id: string) =>
  inHeld(organizationId, userId, async (held) => (await prisma.inventory.count({ where: { id, organizationId, OR: [{ kitchenId: null }, { kitchenId: held }] } })) > 0);

/**
 * A person held to a location keeps events at that location: they may not move one to another location or to none.
 * `undefined` means the request is not changing the location at all.
 */
export async function assertMayMoveEventTo(organizationId: string, userId: string, target: string | null | undefined): Promise<void> {
  if (target === undefined) return;
  const held = await heldLocation(organizationId, userId);
  if (held && target !== held) notFound();
}
