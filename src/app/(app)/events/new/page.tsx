import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listMenus } from "@/modules/menus/menu";
import { NewEventTypeClient } from "./_components/new-event-type-client";

export default async function NewEventTypePage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ events: ["create"] }, organizationId);
  const menus = await listMenus(organizationId);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div>
        <h1 className="text-lg font-semibold">New Event</h1>
        <p className="text-sm text-muted-foreground">Add a type of event you cater, e.g. Wedding Event.</p>
      </div>
      <NewEventTypeClient availableMenus={menus.map((m) => ({ id: m.id, name: m.name }))} />
    </div>
  );
}
