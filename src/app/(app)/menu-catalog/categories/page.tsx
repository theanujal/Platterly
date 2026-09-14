import type { Metadata } from "next";
import { Layers } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listCategories } from "@/modules/menus/category";
import { listMenus } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";
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

  const entries: CatalogEntry[] = categories.map((category) => {
    const initialValues = { name: category.name, description: category.description ?? "", isActive: category.isActive };

    return {
      id: category.id,
      searchText: `${category.name} ${category.description ?? ""}`,
      card: (
        <>
          <div className="flex aspect-video w-full items-center justify-center bg-muted">
            <Layers className="size-6 text-muted-foreground" />
          </div>
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{category.name}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                {!category.isActive && <Badge variant="secondary">Inactive</Badge>}
                <CategoryCardActions
                  categoryId={category.id}
                  name={category.name}
                  initialValues={initialValues}
                  availableMenus={availableMenus}
                />
              </div>
            </div>
            {category.description && <p className="line-clamp-2 text-xs text-muted-foreground">{category.description}</p>}
          </div>
        </>
      ),
      listRow: (
        <>
          <TableCell className="font-medium">{category.name}</TableCell>
          <TableCell>
            <Badge variant={category.isActive ? "default" : "secondary"}>{category.isActive ? "Active" : "Inactive"}</Badge>
          </TableCell>
          <TableCell>
            <CategoryCardActions
              categoryId={category.id}
              name={category.name}
              initialValues={initialValues}
              availableMenus={availableMenus}
            />
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Menu Categories</h1>
          <p className="text-sm text-muted-foreground">Group menu items for easier browsing (e.g. Starters, Main Course).</p>
        </div>
        <AddCategoryDialog availableMenus={availableMenus} />
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={<AddCategoryDialog availableMenus={availableMenus} variant="tile" />}
        columns={["Name", "Status", "Actions"]}
        searchPlaceholder="Search menu categories…"
        emptyLabel="No menu categories yet."
      />
    </div>
  );
}
