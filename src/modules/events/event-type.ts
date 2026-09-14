import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export class EventTypeInUseError extends Error {}

export interface EventTypeInput {
  name: string;
  description?: string;
  image?: string;
  minGuests?: number | null;
  isActive?: boolean;
  /** Chunk 9 Group 9.1 — a curated icon-name key (see src/lib/event-type-icons.ts), not a free-form upload. */
  icon?: string | null;
  /** Full replacement of this Event Type's eligible Menus. */
  menuIds?: string[];
}

async function replaceEventTypeMenus(eventTypeId: string, menuIds: string[] | undefined) {
  if (menuIds === undefined) return;
  await prisma.eventTypeMenu.deleteMany({ where: { eventTypeId } });
  if (menuIds.length === 0) return;
  await prisma.eventTypeMenu.createMany({
    data: menuIds.map((menuId) => ({ eventTypeId, menuId })),
  });
}

export async function createEventType(organizationId: string, input: EventTypeInput, actorUserId: string) {
  const { _max } = await prisma.eventType.aggregate({ where: { organizationId }, _max: { sortOrder: true } });

  const eventType = await prisma.eventType.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      minGuests: input.minGuests,
      isActive: input.isActive ?? true,
      icon: input.icon,
      sortOrder: _max.sortOrder != null ? _max.sortOrder + 1 : 0,
    },
  });
  await replaceEventTypeMenus(eventType.id, input.menuIds);

  await audit({
    organizationId,
    actorUserId,
    action: "event_type.create",
    recordType: "EventType",
    recordId: eventType.id,
    after: JSON.parse(JSON.stringify(eventType)),
  });

  return eventType;
}

export async function updateEventType(
  organizationId: string,
  id: string,
  input: EventTypeInput,
  actorUserId: string,
) {
  const before = await prisma.eventType.findFirstOrThrow({ where: { id, organizationId } });

  const after = await prisma.eventType.update({
    where: { id },
    data: {
      name: input.name,
      description: input.description,
      image: input.image,
      minGuests: input.minGuests,
      isActive: input.isActive ?? before.isActive,
      icon: input.icon,
    },
  });
  await replaceEventTypeMenus(id, input.menuIds);

  await audit({
    organizationId,
    actorUserId,
    action: "event_type.update",
    recordType: "EventType",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
    after: JSON.parse(JSON.stringify(after)),
  });

  return after;
}

/**
 * Move-up/down only reorder (no drag — AJ's explicit "I do not want that
 * there" from the Menu Category rework carries over as the project's
 * standing convention for reorderable admin lists). `orderedIds` must
 * exactly match the tenant's current EventType set.
 */
export async function reorderEventTypes(organizationId: string, orderedIds: string[], actorUserId: string) {
  const existing = await prisma.eventType.findMany({ where: { organizationId }, select: { id: true } });
  const existingIds = new Set(existing.map((e) => e.id));
  if (existingIds.size !== orderedIds.length || orderedIds.some((id) => !existingIds.has(id))) {
    throw new Error("orderedIds must exactly match the tenant's current Event Types.");
  }

  await prisma.$transaction(
    orderedIds.map((id, index) => prisma.eventType.update({ where: { id }, data: { sortOrder: index } })),
  );

  await audit({
    organizationId,
    actorUserId,
    action: "event_type.reorder",
    recordType: "EventType",
    recordId: organizationId,
    after: { orderedIds },
  });
}

/**
 * Now referenced by Event (Chunk 9, onDelete: Restrict) once real Events
 * exist — checked explicitly up front, matching this codebase's existing
 * pre-check convention (e.g. slug.ts's SlugTakenError) rather than catching
 * the DB's own FK-violation error.
 */
export async function deleteEventType(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.eventType.findFirstOrThrow({ where: { id, organizationId } });

  const eventCount = await prisma.event.count({ where: { eventTypeId: id } });
  if (eventCount > 0) {
    throw new EventTypeInUseError(`"${before.name}" has ${eventCount} Event(s) and can't be deleted. Deactivate it instead.`);
  }

  await prisma.eventType.delete({ where: { id } });

  await audit({
    organizationId,
    actorUserId,
    action: "event_type.delete",
    recordType: "EventType",
    recordId: id,
    before: JSON.parse(JSON.stringify(before)),
  });
}

export async function listEventTypes(organizationId: string) {
  return prisma.eventType.findMany({ where: { organizationId }, orderBy: { sortOrder: "asc" } });
}

export async function getEventType(organizationId: string, id: string) {
  return prisma.eventType.findFirst({
    where: { id, organizationId },
    include: { menus: { include: { menu: true } } },
  });
}
