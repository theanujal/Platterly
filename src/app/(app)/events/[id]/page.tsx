import { notFound } from "next/navigation";
import Link from "next/link";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getEvent, listKitchens } from "@/modules/events/event";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { EditEventClient } from "./_components/edit-event-client";
import { DeleteEventButton } from "./_components/delete-event-button";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["edit"] }, organizationId);
  const [event, customers, eventTypes, kitchens, inventoryItems] = await Promise.all([
    getEvent(organizationId, id),
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listKitchens(organizationId),
    listInventoryItems(organizationId),
  ]);
  if (!event) notFound();

  const requiredByInventoryId = new Map(event.requiredInventory.map((r) => [r.inventoryId, r]));

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{event.name}</h1>
          <p className="text-sm text-muted-foreground">
            For{" "}
            <Link href={`/customers/${event.customerId}`} className="text-primary hover:underline">
              {event.customer.name}
            </Link>
          </p>
        </div>
        <DeleteEventButton eventId={event.id} name={event.name} />
      </div>
      <EditEventClient
        eventId={event.id}
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive || t.id === event.eventTypeId).map((t) => ({ id: t.id, name: t.name }))}
        kitchens={kitchens.map((k) => ({ id: k.id, name: k.name, isDefault: k.isDefault }))}
        inventoryItems={inventoryItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
        initialValues={{
          customerId: event.customerId,
          eventTypeId: event.eventTypeId,
          assignedKitchenId: event.assignedKitchenId ?? "",
          name: event.name,
          startDate: toDateInputValue(event.startDate),
          endDate: toDateInputValue(event.endDate),
          venue: event.venue ?? "",
          guestCount: event.guestCount?.toString() ?? "",
          notes: event.notes ?? "",
          status: event.status,
          requiredInventory: inventoryItems.map((item) => {
            const existing = requiredByInventoryId.get(item.id);
            return { inventoryId: item.id, checked: Boolean(existing), quantity: existing ? existing.quantity.toString() : "" };
          }),
        }}
      />
    </div>
  );
}
