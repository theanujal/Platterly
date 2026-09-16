import type { Metadata } from "next";
import { ImageOff } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { listCategories } from "@/modules/menus/category";
import { listMenus } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddItemDialog } from "./_components/add-item-dialog";
import { ItemCardActions } from "./_components/item-card-actions";
import type { ItemFormValues } from "./_components/item-form";

export const metadata: Metadata = {
  title: "Food Items — Platterly",
  robots: { index: false, follow: false },
};

export default async function ItemsPage() {
  const { organizationId } = await requireActiveOrganization();
  const [items, categories, menus] = await Promise.all([
    listMenuItems(organizationId),
    listCategories(organizationId),
    listMenus(organizationId),
  ]);

  const categoryOptions = categories.map((c) => ({ id: c.id, name: c.name }));
  const menuOptions = menus.map((m) => ({ id: m.id, name: m.name }));

  const entries: CatalogEntry[] = items.map((item) => {
    const initialValues: ItemFormValues = {
      name: item.name,
      description: item.description ?? "",
      foodType: item.foodType,
      price: item.price.toString(),
      imageUrl: item.image,
      isActive: item.isActive,
      categoryIds: item.categories.map((c) => c.categoryId),
      menuIds: item.menus.map((m) => m.menuId),
    };

    return {
      id: item.id,
      searchText: `${item.name} ${item.description ?? ""} ${item.categories.map((c) => c.category.name).join(" ")}`,
      filterValues: {
        menuId: item.menus.map((m) => m.menuId),
        categoryId: item.categories.map((c) => c.categoryId),
      },
      sortValues: { name: item.name, price: Number(item.price), newest: item.createdAt.getTime() },
      card: (
        <>
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-muted">
              <ImageOff className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{item.name}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                {!item.isActive && <Badge variant="secondary">Inactive</Badge>}
                <ItemCardActions
                  itemId={item.id}
                  name={item.name}
                  initialValues={initialValues}
                  categories={categoryOptions}
                  menus={menuOptions}
                />
              </div>
            </div>
            {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <Badge variant={item.foodType === "NON_VEGETARIAN" ? "destructive" : "default"}>
                {item.foodType === "NON_VEGETARIAN" ? "Non-Veg" : "Veg"}
              </Badge>
              {item.categories.map((c) => (
                <Badge key={c.categoryId} variant="secondary">
                  {c.category.name}
                </Badge>
              ))}
            </div>
            <span className="pt-1 text-sm font-semibold">₹{Number(item.price).toFixed(2)}</span>
          </div>
        </>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{item.name}</TableCell>
          <TableCell className="text-muted-foreground">
            {item.categories.map((c) => c.category.name).join(", ") || "—"}
          </TableCell>
          <TableCell>
            <Badge variant={item.foodType === "NON_VEGETARIAN" ? "destructive" : "default"}>
              {item.foodType === "NON_VEGETARIAN" ? "Non-Veg" : "Veg"}
            </Badge>
          </TableCell>
          <TableCell>₹{Number(item.price).toFixed(2)}</TableCell>
          <TableCell>
            <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <ItemCardActions
              itemId={item.id}
              name={item.name}
              initialValues={initialValues}
              categories={categoryOptions}
              menus={menuOptions}
            />
          </TableCell>
        </>
      ),
    };
  });

  const filterOptions: CatalogFilterOption[] = [
    { key: "menuId", allLabel: "Menu Type", options: menuOptions.map((m) => ({ value: m.id, label: m.name })) },
    { key: "categoryId", allLabel: "Category", options: categoryOptions.map((c) => ({ value: c.id, label: c.name })) },
  ];

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "name", label: "Name (A–Z)", key: "name" },
    { value: "price-low", label: "Price (Low–High)", key: "price" },
    { value: "price-high", label: "Price (High–Low)", key: "price", direction: "desc" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Food Items</h1>
          <p className="text-sm text-muted-foreground">Your reusable product catalog — the dishes caterers add to menus.</p>
        </div>
        <AddItemDialog categories={categoryOptions} menus={menuOptions} />
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={<AddItemDialog categories={categoryOptions} menus={menuOptions} variant="tile" />}
        columns={["Name", "Category", "Type", "Price", "Status", "Actions"]}
        searchPlaceholder="Search food items…"
        emptyLabel="No food items yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={8}
      />
    </div>
  );
}
