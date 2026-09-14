import type { Metadata } from "next";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listCategories } from "@/modules/menus/category";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddCategoryDialog } from "./_components/add-category-dialog";
import { CategoryRowActions } from "./_components/category-row-actions";

export const metadata: Metadata = {
  title: "Menu Categories — Platterly",
  robots: { index: false, follow: false },
};

export default async function CategoriesPage() {
  const { organizationId } = await requireActiveOrganization();
  const categories = await listCategories(organizationId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Categories</h1>
          <p className="text-sm text-muted-foreground">Group menu items for easier browsing (e.g. Starters, Main Course).</p>
        </div>
        <AddCategoryDialog />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Sort order</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {categories.map((category) => (
            <TableRow key={category.id}>
              <TableCell className="font-medium">{category.name}</TableCell>
              <TableCell className="text-muted-foreground">{category.sortOrder}</TableCell>
              <TableCell>
                <CategoryRowActions categoryId={category.id} name={category.name} />
              </TableCell>
            </TableRow>
          ))}
          {categories.length === 0 && (
            <TableRow>
              <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                No categories yet.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
