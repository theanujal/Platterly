import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getMenuItem } from "@/modules/menus/item";
import { listCategories } from "@/modules/menus/category";
import { listMenus } from "@/modules/menus/menu";
import { EditItemClient } from "./_components/edit-item-client";
import { ItemRowActions } from "../_components/item-row-actions";

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  const [item, categories, menus] = await Promise.all([
    getMenuItem(organizationId, id),
    listCategories(organizationId),
    listMenus(organizationId),
  ]);
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{item.name}</h1>
          <p className="text-sm text-muted-foreground">Edit this menu item.</p>
        </div>
        {item.isActive && <ItemRowActions itemId={item.id} />}
      </div>
      <EditItemClient
        itemId={item.id}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        menus={menus.map((m) => ({ id: m.id, name: m.name }))}
        initialValues={{
          name: item.name,
          description: item.description ?? "",
          foodType: item.foodType,
          price: item.price.toString(),
          imageUrl: item.image,
          categoryIds: item.categories.map((c) => c.categoryId),
          menuIds: item.menus.map((m) => m.menuId),
        }}
      />
    </div>
  );
}
