import "server-only";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit/audit";

export interface EventTypeInput {
  name: string;
  description?: string;
  image?: string;
  minGuests?: number | null;
  isActive?: boolean;
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
  const eventType = await prisma.eventType.create({
    data: {
      organizationId,
      name: input.name,
      description: input.description,
      image: input.image,
      minGuests: input.minGuests,
      isActive: input.isActive ?? true,
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

/** Hard delete — nothing references EventType yet (unlike MenuItem, which soft-deactivates because packages/menus used to reference it). */
export async function deleteEventType(organizationId: string, id: string, actorUserId: string) {
  const before = await prisma.eventType.findFirstOrThrow({ where: { id, organizationId } });
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
  return prisma.eventType.findMany({ where: { organizationId }, orderBy: { name: "asc" } });
}

export async function getEventType(organizationId: string, id: string) {
  return prisma.eventType.findFirst({
    where: { id, organizationId },
    include: { menus: { include: { menu: true } } },
  });
}
