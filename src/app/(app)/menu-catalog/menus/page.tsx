import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
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
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell, FoodTypeTag, formatRupees } from "@/components/catalog/catalog-display";
import { AddMenuDialog } from "./_components/add-menu-dialog";
import { MenuCardActions } from "./_components/menu-card-actions";
import type { MenuFormValues, AssignedCategory } from "./_components/menu-form";

export const metadata: Metadata = {
  title: "Menu Types — Platterly",
  robots: { index: false, follow: false },
};

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
          <CatalogCardMedia src={menu.image} icon={BookOpen} />
          <CatalogCardBody
            title={menu.name}
            trailing={
              <>
                {!menu.isActive && <Badge variant="neutral">Inactive</Badge>}
                <MenuCardActions menuId={menu.id} name={menu.name} initialValues={initialValues} assignedCategories={assignedCategories} />
              </>
            }
            description={menu.description}
            tags={<FoodTypeTag nonVeg={menu.menuType === "NON_VEGETARIAN"} />}
            footer={
              <>
                <span className="text-base font-semibold">{formatRupees(Number(menu.pricePerPlate))}</span>
                <span className="text-xs text-muted-foreground">per plate</span>
              </>
            }
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={menu.name} description={menu.description} src={menu.image} icon={BookOpen} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <FoodTypeTag nonVeg={menu.menuType === "NON_VEGETARIAN"} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex flex-col">
              <span className="text-sm font-semibold">{formatRupees(Number(menu.pricePerPlate))}</span>
              <span className="text-xs text-muted-foreground">per plate</span>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={menu.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <MenuCardActions menuId={menu.id} name={menu.name} initialValues={initialValues} assignedCategories={assignedCategories} />
            </div>
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
        columns={["Menu Type", "Diet", "Price", "Status", ""]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search menu types…"
        emptyLabel="No menu types yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
