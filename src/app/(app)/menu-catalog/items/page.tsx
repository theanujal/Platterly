import type { Metadata } from "next";
import { ImageOff } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";

export const metadata: Metadata = {
  title: "Menu Items — Platterly",
  robots: { index: false, follow: false },
};

export default async function ItemsPage() {
  const { organizationId } = await requireActiveOrganization();
  const items = await listMenuItems(organizationId);

  const entries: CatalogEntry[] = items.map((item) => ({
    id: item.id,
    href: `/menu-catalog/items/${item.id}`,
    searchText: `${item.name} ${item.description ?? ""} ${item.categories.map((c) => c.category.name).join(" ")}`,
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
            {!item.isActive && <Badge variant="secondary">Inactive</Badge>}
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
        <TableCell className="text-muted-foreground">{item.categories.map((c) => c.category.name).join(", ") || "—"}</TableCell>
        <TableCell>
          <Badge variant={item.foodType === "NON_VEGETARIAN" ? "destructive" : "default"}>
            {item.foodType === "NON_VEGETARIAN" ? "Non-Veg" : "Veg"}
          </Badge>
        </TableCell>
        <TableCell>₹{Number(item.price).toFixed(2)}</TableCell>
        <TableCell>
          <Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge>
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Menu Items</h1>
        <p className="text-sm text-muted-foreground">Your reusable product catalog — dishes and add-ons.</p>
      </div>

      <CatalogBrowser
        entries={entries}
        newHref="/menu-catalog/items/new"
        newLabel="Add New Item"
        searchPlaceholder="Search items…"
        emptyLabel="No menu items yet."
        listColumnCount={5}
      />
    </div>
  );
}
