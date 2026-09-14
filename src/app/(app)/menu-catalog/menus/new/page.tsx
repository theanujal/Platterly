import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { NewMenuClient } from "./_components/new-menu-client";

export default async function NewMenuPage() {
  const { organizationId } = await requireActiveOrganization();
  const items = await listMenuItems(organizationId, { isActive: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Menu</h1>
        <p className="text-sm text-muted-foreground">Group catalog items into a named, browsable menu.</p>
      </div>
      <NewMenuClient availableItems={items.map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
