import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getMenu } from "@/modules/menus/menu";
import { listMenuItems } from "@/modules/menus/item";
import { listCategories } from "@/modules/menus/category";
import { EditMenuClient } from "./_components/edit-menu-client";
import { MenuRowActions } from "../_components/menu-row-actions";

export default async function EditMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  const [menu, items, categories] = await Promise.all([
    getMenu(organizationId, id),
    listMenuItems(organizationId, { isActive: true }),
    listCategories(organizationId),
  ]);
  if (!menu) notFound();

  const categoryAssignments = categories.map((category) => {
    const existing = menu.categoryAssignments.find((a) => a.categoryId === category.id);
    return {
      categoryId: category.id,
      checked: !!existing,
      maxSelection: existing?.maxSelection != null ? existing.maxSelection.toString() : "",
      sortOrder: existing ? existing.sortOrder.toString() : "0",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{menu.name}</h1>
          <p className="text-sm text-muted-foreground">Edit this menu type.</p>
        </div>
        <MenuRowActions menuId={menu.id} name={menu.name} />
      </div>
      <EditMenuClient
        menuId={menu.id}
        availableItems={items.map((i) => ({ id: i.id, name: i.name }))}
        availableCategories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initialValues={{
          name: menu.name,
          description: menu.description ?? "",
          imageUrl: menu.image,
          menuType: menu.menuType,
          pricePerPlate: menu.pricePerPlate.toString(),
          isActive: menu.isActive,
          itemIds: menu.items.map((i) => i.menuItemId),
          categoryAssignments,
        }}
      />
    </div>
  );
}
