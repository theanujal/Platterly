import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listCategories } from "@/modules/menus/category";
import { listMenus } from "@/modules/menus/menu";
import { NewItemClient } from "./_components/new-item-client";

export default async function NewMenuItemPage() {
  const { organizationId } = await requireActiveOrganization();
  const [categories, menus] = await Promise.all([listCategories(organizationId), listMenus(organizationId)]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Menu Item</h1>
        <p className="text-sm text-muted-foreground">Add a dish to your catalog.</p>
      </div>
      <NewItemClient
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        menus={menus.map((m) => ({ id: m.id, name: m.name }))}
      />
    </div>
  );
}
