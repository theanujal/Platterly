import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getMenu } from "@/modules/menus/menu";
import { listMenuItems } from "@/modules/menus/item";
import { EditMenuClient } from "./_components/edit-menu-client";

export default async function EditMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  const [menu, items] = await Promise.all([getMenu(organizationId, id), listMenuItems(organizationId, { isActive: true })]);
  if (!menu) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{menu.name}</h1>
        <p className="text-sm text-muted-foreground">Edit this menu.</p>
      </div>
      <EditMenuClient
        menuId={menu.id}
        availableItems={items.map((i) => ({ id: i.id, name: i.name }))}
        initialValues={{
          name: menu.name,
          description: menu.description ?? "",
          imageUrl: menu.image,
          itemIds: menu.items.map((i) => i.menuItemId),
        }}
      />
    </div>
  );
}
