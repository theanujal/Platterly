import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { listCategories } from "@/modules/menus/category";
import { NewMenuClient } from "./_components/new-menu-client";

export default async function NewMenuPage() {
  const { organizationId } = await requireActiveOrganization();
  const [items, categories] = await Promise.all([
    listMenuItems(organizationId, { isActive: true }),
    listCategories(organizationId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Menu Type</h1>
        <p className="text-sm text-muted-foreground">Set up a priced, sellable menu type.</p>
      </div>
      <NewMenuClient
        availableItems={items.map((i) => ({ id: i.id, name: i.name }))}
        availableCategories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
