import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listCustomers } from "@/modules/customers/customer";
import { listEventTypes } from "@/modules/events/event-type";
import { listKitchens } from "@/modules/events/event";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { NewEventClient } from "./_components/new-event-client";

export default async function NewEventPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["create"] }, organizationId);
  const [customers, eventTypes, kitchens, inventoryItems] = await Promise.all([
    listCustomers(organizationId),
    listEventTypes(organizationId),
    listKitchens(organizationId),
    listInventoryItems(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-lg font-semibold">Create Event</h1>
        <p className="text-sm text-muted-foreground">Events are created by selecting a customer, event type, and required inventory.</p>
      </div>
      <NewEventClient
        customers={customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        eventTypes={eventTypes.filter((t) => t.isActive).map((t) => ({ id: t.id, name: t.name }))}
        kitchens={kitchens.map((k) => ({ id: k.id, name: k.name, isDefault: k.isDefault }))}
        inventoryItems={inventoryItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit }))}
      />
    </div>
  );
}
