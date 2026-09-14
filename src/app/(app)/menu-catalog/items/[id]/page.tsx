import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getMenuItem } from "@/modules/menus/item";
import { listCategories } from "@/modules/menus/category";
import { EditItemClient } from "./_components/edit-item-client";

export default async function EditMenuItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  const [item, categories] = await Promise.all([getMenuItem(organizationId, id), listCategories(organizationId)]);
  if (!item) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{item.name}</h1>
        <p className="text-sm text-muted-foreground">Edit this menu item.</p>
      </div>
      <EditItemClient
        itemId={item.id}
        categories={categories}
        initialValues={{
          name: item.name,
          description: item.description ?? "",
          categoryId: item.categoryId ?? "__none__",
          isFoodProduct: item.isFoodProduct,
          foodType: item.foodType ?? "__none__",
          dietaryType: item.dietaryType ?? "__none__",
          eggInfo: item.eggInfo ?? "__none__",
          price: item.price.toString(),
          imageUrl: item.image,
        }}
      />
    </div>
  );
}
