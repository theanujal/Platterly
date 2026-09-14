import { notFound } from "next/navigation";
import Link from "next/link";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getCategory, listCategoryMenuAssignments } from "@/modules/menus/category";
import { EditCategoryClient } from "./_components/edit-category-client";
import { CategoryRowActions } from "../_components/category-row-actions";

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  const [category, assignments] = await Promise.all([
    getCategory(organizationId, id),
    listCategoryMenuAssignments(organizationId, id),
  ]);
  if (!category) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{category.name}</h1>
          <p className="text-sm text-muted-foreground">Edit this category.</p>
        </div>
        <CategoryRowActions categoryId={category.id} name={category.name} />
      </div>
      <EditCategoryClient
        categoryId={category.id}
        initialValues={{
          name: category.name,
          description: category.description ?? "",
          isActive: category.isActive,
        }}
      />
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Used in these menus</h2>
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not assigned to any menu yet — manage that from a{" "}
            <Link href="/menu-catalog/menus" className="text-primary hover:underline">
              Menu&apos;s
            </Link>{" "}
            edit page.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {assignments.map((a) => (
              <li key={a.id}>
                <Link href={`/menu-catalog/menus/${a.menuId}`} className="text-primary hover:underline">
                  {a.menu.name}
                </Link>{" "}
                <span className="text-muted-foreground">
                  (max {a.maxSelection ?? "unlimited"}, position {a.sortOrder})
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
