import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listCategories } from "@/modules/menus/category";
import { listMenus } from "@/modules/menus/menu";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import {
  CatalogBrowser,
  type CatalogEntry,
  type CatalogFilterOption,
  type CatalogSortOption,
} from "@/components/catalog/catalog-browser";
import { ActiveBadge, CATALOG_GRID_CLASSNAME, CatalogCardBody, CatalogCardMedia, CatalogNameCell } from "@/components/catalog/catalog-display";
import { AddCategoryDialog } from "./_components/add-category-dialog";
import { CategoryCardActions } from "./_components/category-card-actions";

export const metadata: Metadata = {
  title: "Menu Categories — Platterly",
  robots: { index: false, follow: false },
};

export default async function CategoriesPage() {
  const { organizationId } = await requireActiveOrganization();
  const [categories, menus] = await Promise.all([listCategories(organizationId), listMenus(organizationId)]);
  const availableMenus = menus.map((m) => ({ id: m.id, name: m.name }));
  const assignedMenuCount = (categoryId: string) => menus.filter((m) => m.categoryAssignments.some((a) => a.categoryId === categoryId)).length;
  const assignedText = (n: number) => (n === 0 ? "Not assigned to a menu" : `Assigned to ${n} ${n === 1 ? "menu" : "menus"}`);

  const entries: CatalogEntry[] = categories.map((category) => {
    const initialValues = { name: category.name, description: category.description ?? "", isActive: category.isActive };

    return {
      id: category.id,
      searchText: `${category.name} ${category.description ?? ""}`,
      filterValues: { status: category.isActive ? "ACTIVE" : "INACTIVE" },
      sortValues: { name: category.name, newest: category.createdAt.getTime() },
      card: (
        <>
          <CatalogCardMedia
            src={null}
            icon={Layers}
            overlay={<CategoryCardActions categoryId={category.id} name={category.name} initialValues={initialValues} availableMenus={availableMenus} />}
          />
          <CatalogCardBody
            title={category.name}
            description={category.description}
            footer={<span className="text-sm text-muted-foreground">{assignedText(assignedMenuCount(category.id))}</span>}
            active={category.isActive}
          />
        </>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <CatalogNameCell name={category.name} description={category.description} src={null} icon={Layers} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <ActiveBadge active={category.isActive} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex justify-end">
              <CategoryCardActions categoryId={category.id} name={category.name} initialValues={initialValues} availableMenus={availableMenus} variant="plain" />
            </div>
          </TableCell>
        </>
      ),
    };
  });

  const filterOptions: CatalogFilterOption[] = [
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
  ];

  return (
    <div className="flex flex-col gap-4">
      <PageBreadcrumb
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Catalog", href: "/menu-catalog" }, { label: "Menu Categories" }]}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Menu Categories</h1>
          <p className="text-sm text-muted-foreground">Group menu items for easier browsing (e.g. Starters, Main Course).</p>
        </div>
        <AddCategoryDialog availableMenus={availableMenus} />
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        defaultView="list"
        addTile={<AddCategoryDialog availableMenus={availableMenus} variant="tile" />}
        columns={["Menu Category", "Status", ""]}
        richList
        gridColumnsClassName={CATALOG_GRID_CLASSNAME}
        searchPlaceholder="Search menu categories…"
        emptyLabel="No menu categories yet."
        filterOptions={filterOptions}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
