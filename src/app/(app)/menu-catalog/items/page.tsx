import { ItemHighlightBadges } from "@/components/catalog/item-highlights";
import type { Metadata } from "next";
import { UtensilsCrossed } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { listCategories } from "@/modules/menus/category";
import { listMenus } from "@/modules/menus/menu";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { listRecipes } from "@/modules/recipes/recipe";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell, FoodTypeTag, formatRupees } from "@/components/catalog/catalog-display";
import { CatalogBrowser, type CatalogEntry, type CatalogFilterOption, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { AddItemDialog } from "./_components/add-item-dialog";
import { AddItemMenu } from "./_components/add-item-menu";
import { listCatalog } from "@/modules/menus/catalog/catalog";
import { ItemCardActions } from "./_components/item-card-actions";
import type { ItemFormValues } from "./_components/item-form";

export const metadata: Metadata = {
  title: "Food Items — Platterly",
  robots: { index: false, follow: false },
};

export default async function ItemsPage() {
  const { organizationId } = await requireActiveOrganization();
  const [items, categories, menus, inventory, recipes, catalog] = await Promise.all([
    listMenuItems(organizationId),
    listCategories(organizationId),
    listMenus(organizationId),
    listInventoryItems(organizationId),
    listRecipes(organizationId),
    listCatalog(organizationId),
  ]);
  const ingredientOptions = inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit) }));
  const recipeByItem = new Map(
    recipes.map((r) => [
      r.menuItemId,
      { yieldServings: r.yieldServings.toString(), notes: r.notes ?? "", ingredients: r.ingredients.map((i) => ({ inventoryId: i.inventoryId, quantity: i.quantity.toString() })) },
    ]),
  );

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
      isPopular: item.isPopular,
      isChefsSpecial: item.isChefsSpecial,
      isLiveCounter: item.isLiveCounter,
      categoryIds: item.categories.map((c) => c.categoryId),
      menuIds: item.menus.map((m) => m.menuId),
      origin: item.origin ?? "",
      baseType: item.baseType ?? "",
      preparationMethod: item.preparationMethod ?? "",
      spiceLevel: item.spiceLevel ?? "",
      onionGarlic: item.onionGarlic ?? "",
      vegFriendly: item.vegFriendly ?? false,
      nonVegFriendly: item.nonVegFriendly ?? false,
      texture: item.texture ?? "",
      tasteProfile: item.tasteProfile ?? "",
      keyIngredients: item.keyIngredients ?? "",
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
          <CatalogCardMedia
            src={item.image}
            icon={UtensilsCrossed}
            overlay={
              <>
                <FoodTypeTag nonVeg={item.foodType === "NON_VEGETARIAN"} onImage />
                <ItemCardActions itemId={item.id} name={item.name} initialValues={initialValues} categories={categoryOptions} menus={menuOptions} recipe={recipeByItem.get(item.id) ?? null} ingredientOptions={ingredientOptions} />
              </>
            }
          />
          <CatalogCardBody
            title={item.name}
            description={item.description}
            tags={
              <>
                <ItemHighlightBadges highlights={{ popular: item.isPopular, chefsSpecial: item.isChefsSpecial, liveCounter: item.isLiveCounter }} className="contents" />
                <Badge variant="outline">
                  Menus: {item.menus.length}
                </Badge>
                <Badge variant="outline">
                  Categories: {item.categories.length}
                </Badge>
                {recipeByItem.has(item.id) && <Badge variant="info">Recipe</Badge>}
              </>
            }
            footer={<span className="text-base font-semibold">{formatRupees(Number(item.price))}</span>}
            active={item.isActive}
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={item.name} description={item.description} src={item.image} icon={UtensilsCrossed} />
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{item.categories.map((c) => c.category.name).join(", ") || "—"}</TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <FoodTypeTag nonVeg={item.foodType === "NON_VEGETARIAN"} />
              <ItemHighlightBadges highlights={{ popular: item.isPopular, chefsSpecial: item.isChefsSpecial, liveCounter: item.isLiveCounter }} className="contents" />
              {recipeByItem.has(item.id) && <Badge variant="info">Recipe</Badge>}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm font-semibold">{formatRupees(Number(item.price))}</TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={item.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <ItemCardActions itemId={item.id} name={item.name} initialValues={initialValues} categories={categoryOptions} menus={menuOptions} recipe={recipeByItem.get(item.id) ?? null} ingredientOptions={ingredientOptions} variant="plain" />
            </div>
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
      <PageBreadcrumb
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Catalog", href: "/menu-catalog" }, { label: "Food Items" }]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Food Items</h1>
          <p className="text-sm text-muted-foreground">Your reusable product catalog — the dishes caterers add to menus.</p>
        </div>
        <AddItemMenu categories={categoryOptions} menus={menuOptions} catalog={catalog} />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        defaultView="list"
        addTile={<AddItemDialog categories={categoryOptions} menus={menuOptions} variant="tile" />}
        columns={["Food Item", "Category", "Type", "Price", "Status", ""]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search food items…"
        emptyLabel="No food items yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
