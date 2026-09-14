import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listCategories } from "@/modules/menus/category";
import { NewItemClient } from "./_components/new-item-client";

export default async function NewMenuItemPage() {
  const { organizationId } = await requireActiveOrganization();
  const categories = await listCategories(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Menu Item</h1>
        <p className="text-sm text-muted-foreground">Add a dish or non-food product to your catalog.</p>
      </div>
      <NewItemClient categories={categories} />
    </div>
  );
}
