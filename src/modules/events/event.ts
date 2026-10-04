import { emitEvents } from "@/modules/webhooks/emit";
import "server-only";
import { assertOwnedRefs } from "@/lib/tenant-refs";
import { assertWithinPlanLimit } from "@/modules/subscriptions/limits";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";
import type { EventStatus } from "@/generated/prisma/enums";

export interface RequiredInventoryInput {
  inventoryId: string;
  quantity: number;
}

export interface EventInput {
  customerId: string;
  eventTypeId: string;
  assignedKitchenId?: string | null;
  name: string;
  startDate: Date;
  endDate: Date;
  venue?: string;
  guestCount?: number | null;
  notes?: string;
  status?: EventStatus;
  /** Full replacement of this Event's required-inventory list. */
  requiredInventory?: RequiredInventoryInput[];
}

async function replaceRequiredInventory(eventId: string, items: RequiredInventoryInput[] | undefined) {
  if (items === undefined) return;
  await prisma.eventRequiredInventory.deleteMany({ where: { eventId } });
  if (items.length === 0) return;
  await prisma.eventRequiredInventory.createMany({
    data: items.map((item) => ({ eventId, inventoryId: item.inventoryId, quantity: item.quantity })),
  });
}

export interface EventOperationsPatch {
  /** null clears the assignment. */
  assignedKitchenId?: string | null;
  status?: EventStatus;
  /** Full replacement of the required-inventory list. */
  requiredInventory?: RequiredInventoryInput[];
}

/**
 * The operational fields the Order page edits in place (AJ, 2026-09-27) — the
 * assigned kitchen, the event status and the required inventory. Everything
 * else on an Event (type, dates, venue, guests) follows its Order, so this is
 * deliberately not the full `updateEvent`.
 */
export async function updateEventOperations(organizationId: string, id: string, patch: EventOperationsPatch, actorUserId: string) {
  const before = await prisma.event.findFirstOrThrow({ where: { id, organizationId } });
  if (patch.assignedKitchenId) {
    const kitchen = await prisma.kitchen.findFirst({ where: { id: patch.assignedKitchenId, organizationId }, select: { id: true } });
    if (!kitchen) throw new Error("That kitchen doesn't exist.");
  }
  const after = await prisma.event.update({
    where: { id },
    data: { assignedKitchenId: patch.assignedKitchenId, status: patch.status },
  });
  await replaceRequiredInventory(id, patch.requiredInventory);

  await audit({
    organizationId,
    actorUserId,
    action: "event.update_operations",
    recordType: "Event",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });
  await emitEvents(organizationId, "event.updated", [id]);
  return after;
}

export async function createEvent(organizationId: string, input: EventInput, actorUserId?: string) {
  await assertWithinPlanLimit(organizationId, "maxEvents");
  await assertOwnedRefs(organizationId, { customerId: input.customerId, eventTypeId: input.eventTypeId, kitchenId: input.assignedKitchenId });
  const event = await prisma.event.create({
    data: {
      organizationId,
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      assignedKitchenId: input.assignedKitchenId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      venue: input.venue,
      guestCount: input.guestCount,
      notes: input.notes,
      status: input.status ?? "PENDING",
    },
  });
  await replaceRequiredInventory(event.id, input.requiredInventory);

  await audit({
    organizationId,
    actorUserId,
    action: "event.create",
    recordType: "Event",
    recordId: event.id,
    after: JSON.parse(JSON.stringify(event)),
  });
  await emitEvents(organizationId, "event.created", [event.id]);

  return event;
}

export async function updateEvent(organizationId: string, id: string, input: EventInput, actorUserId: string) {
  const before = await prisma.event.findFirstOrThrow({ where: { id, organizationId } });
  await assertOwnedRefs(organizationId, { customerId: input.customerId, eventTypeId: input.eventTypeId, kitchenId: input.assignedKitchenId });

  const after = await prisma.event.update({
    where: { id },
    data: {
      customerId: input.customerId,
      eventTypeId: input.eventTypeId,
      assignedKitchenId: input.assignedKitchenId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      venue: input.venue,
      guestCount: input.guestCount,
      notes: input.notes,
      status: input.status ?? before.status,
    },
  });
  await replaceRequiredInventory(id, input.requiredInventory);

  await audit({
    organizationId,
    actorUserId,
    action: "event.update",
    recordType: "Event",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });
  await emitEvents(organizationId, "event.updated", [id]);

  return after;
}

/** Hard delete — nothing references Event yet (Chunk 10's Order.eventId, once it exists, will be the first). EventRequiredInventory cascades. */
export async function deleteEvent(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.event.findFirstOrThrow({ where: { id, organizationId } });
  await prisma.event.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "event.delete",
    recordType: "Event",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export interface EventListFilter {
  status?: EventStatus;
  assignedKitchenId?: string;
  search?: string;
}

/** Events Dashboard (Updated doc §9): search + status filter + location(Kitchen) filter. */
export async function listEvents(organizationId: string, filter?: EventListFilter) {
  return prisma.event.findMany({
    where: {
      organizationId,
      status: filter?.status,
      assignedKitchenId: filter?.assignedKitchenId,
      name: filter?.search ? { contains: filter.search, mode: "insensitive" } : undefined,
    },
    include: {
      customer: { select: { id: true, name: true } },
      eventType: { select: { id: true, name: true, icon: true } },
      assignedKitchen: { select: { id: true, name: true } },
    },
    orderBy: { startDate: "desc" },
  });
}

/**
 * Feeds the Events Dashboard's location filter and the Event form's
 * assignedKitchen picker. Only one default Kitchen is usable until Chunk
 * 23's multi-location UI, but the query/picker is written correctly for
 * when more exist.
 */
export async function listKitchens(organizationId: string) {
  return prisma.kitchen.findMany({ where: { organizationId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
}

export async function getEvent(organizationId: string, id: string) {
  return prisma.event.findFirst({
    where: { id, organizationId },
    include: {
      customer: true,
      eventType: true,
      assignedKitchen: true,
      requiredInventory: { include: { inventory: { select: { id: true, name: true, unit: true, stockCount: true } } } },
    },
  });
}
