import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getEventType } from "@/modules/events/event-type";
import { listMenus } from "@/modules/menus/menu";
import { EditEventTypeClient } from "./_components/edit-event-type-client";
import { EventTypeRowActions } from "../_components/event-type-row-actions";

export default async function EditEventTypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  const [eventType, menus] = await Promise.all([getEventType(organizationId, id), listMenus(organizationId)]);
  if (!eventType) notFound();

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{eventType.name}</h1>
          <p className="text-sm text-muted-foreground">Edit this event type.</p>
        </div>
        <EventTypeRowActions eventTypeId={eventType.id} name={eventType.name} />
      </div>
      <EditEventTypeClient
        eventTypeId={eventType.id}
        availableMenus={menus.map((m) => ({ id: m.id, name: m.name }))}
        initialValues={{
          name: eventType.name,
          description: eventType.description ?? "",
          imageUrl: eventType.image,
          minGuests: eventType.minGuests?.toString() ?? "",
          isActive: eventType.isActive,
          icon: eventType.icon ?? "other",
          menuIds: eventType.menus.map((m) => m.menuId),
        }}
      />
    </div>
  );
}
