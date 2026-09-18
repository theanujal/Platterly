import type { Metadata } from "next";
import { ImageOff } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenus } from "@/modules/menus/menu";
import { listCategories } from "@/modules/menus/category";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import {
  CatalogBrowser,
  type CatalogEntry,
  type CatalogFilterOption,
  type CatalogSortOption,
} from "@/components/catalog/catalog-browser";
import { AddMenuDialog } from "./_components/add-menu-dialog";
import { MenuCardActions } from "./_components/menu-card-actions";
import type { MenuFormValues, AssignedCategory } from "./_components/menu-form";

export const metadata: Metadata = {
  title: "Menu Types — Platterly",
  robots: { index: false, follow: false },
};

/** Veg/Non-Veg reads as green/red everywhere it's shown — a dietary signal, not a brand-color one, so it deliberately doesn't reuse Badge's primary/destructive variants (which would make Veg render in the brand orange). Same fix as Food Items' FoodTypeBadge. */
function MenuTypeBadge({ nonVeg }: { nonVeg: boolean }) {
  return (
    <Badge
      variant="secondary"
      className={nonVeg ? "border-transparent bg-red-100 text-red-700" : "border-transparent bg-green-100 text-green-700"}
    >
      {nonVeg ? "Non-Veg" : "Veg"}
    </Badge>
  );
}

export default async function MenusPage() {
  const { organizationId } = await requireActiveOrganization();
  const [menus, categories] = await Promise.all([listMenus(organizationId), listCategories(organizationId)]);

  const entries: CatalogEntry[] = menus.map((menu) => {
    const assignedCategories: AssignedCategory[] = [...menu.categoryAssignments]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({
        categoryId: a.categoryId,
        name: categories.find((c) => c.id === a.categoryId)?.name ?? "Unknown category",
        maxSelection: a.maxSelection,
      }));
    const initialValues: MenuFormValues = {
      name: menu.name,
      description: menu.description ?? "",
      imageUrl: menu.image,
      menuType: menu.menuType,
      pricePerPlate: menu.pricePerPlate.toString(),
      isActive: menu.isActive,
      childUnder5Chargeable: menu.childUnder5Chargeable,
      childUnder5Price: menu.childUnder5Price?.toString() ?? "",
      child5To10PricingType: menu.child5To10PricingType,
      child5To10PriceValue: menu.child5To10PriceValue?.toString() ?? "",
    };

    return {
      id: menu.id,
      searchText: `${menu.name} ${menu.description ?? ""}`,
      filterValues: { type: menu.menuType, status: menu.isActive ? "ACTIVE" : "INACTIVE" },
      sortValues: { name: menu.name, price: Number(menu.pricePerPlate), newest: menu.createdAt.getTime() },
      card: (
        <>
          {menu.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={menu.image} alt="" className="aspect-video w-full object-cover" />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-muted">
              <ImageOff className="size-6 text-muted-foreground" />
            </div>
          )}
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{menu.name}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                {!menu.isActive && <Badge variant="neutral">Inactive</Badge>}
                <MenuCardActions menuId={menu.id} name={menu.name} initialValues={initialValues} assignedCategories={assignedCategories} />
              </div>
            </div>
            {menu.description && <p className="line-clamp-2 text-xs text-muted-foreground">{menu.description}</p>}
            <div className="flex items-center gap-1.5 pt-1">
              <MenuTypeBadge nonVeg={menu.menuType === "NON_VEGETARIAN"} />
            </div>
            <span className="pt-1 text-sm font-semibold">₹{Number(menu.pricePerPlate).toFixed(2)} / plate</span>
          </div>
        </>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{menu.name}</TableCell>
          <TableCell>
            <MenuTypeBadge nonVeg={menu.menuType === "NON_VEGETARIAN"} />
          </TableCell>
          <TableCell>₹{Number(menu.pricePerPlate).toFixed(2)}</TableCell>
          <TableCell>
            <Badge variant={menu.isActive ? "success" : "neutral"}>{menu.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <MenuCardActions menuId={menu.id} name={menu.name} initialValues={initialValues} assignedCategories={assignedCategories} />
          </TableCell>
        </>
      ),
    };
  });

  const filterOptions: CatalogFilterOption[] = [
    {
      key: "type",
      allLabel: "Type",
      options: [
        { value: "VEGETARIAN", label: "Veg" },
        { value: "NON_VEGETARIAN", label: "Non-Veg" },
      ],
    },
    {
      key: "status",
      allLabel: "Status",
      options: [
        { value: "ACTIVE", label: "Active" },
        { value: "INACTIVE", label: "Inactive" },
      ],
    },
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
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Catalog", href: "/menu-catalog" }, { label: "Menu Types" }]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Menu Types</h1>
          <p className="text-sm text-muted-foreground">Priced, sellable menu types built from your catalog.</p>
        </div>
        <AddMenuDialog />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={<AddMenuDialog variant="tile" />}
        columns={["Name", "Type", "Price", "Status", "Actions"]}
        searchPlaceholder="Search menu types…"
        emptyLabel="No menu types yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
