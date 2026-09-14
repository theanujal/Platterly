import type { Metadata } from "next";
import { ImageOff } from "lucide-react";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenus } from "@/modules/menus/menu";
import { Badge } from "@/components/ui/badge";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry } from "@/components/catalog/catalog-browser";

export const metadata: Metadata = {
  title: "Menu Types — Platterly",
  robots: { index: false, follow: false },
};

export default async function MenusPage() {
  const { organizationId } = await requireActiveOrganization();
  const menus = await listMenus(organizationId);

  const entries: CatalogEntry[] = menus.map((menu) => ({
    id: menu.id,
    href: `/menu-catalog/menus/${menu.id}`,
    searchText: `${menu.name} ${menu.description ?? ""}`,
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
            {!menu.isActive && <Badge variant="secondary">Inactive</Badge>}
          </div>
          {menu.description && <p className="line-clamp-2 text-xs text-muted-foreground">{menu.description}</p>}
          <div className="flex items-center gap-1.5 pt-1">
            <Badge variant={menu.menuType === "NON_VEGETARIAN" ? "destructive" : "default"}>
              {menu.menuType === "NON_VEGETARIAN" ? "Non-Veg" : "Veg"}
            </Badge>
          </div>
          <span className="pt-1 text-sm font-semibold">₹{Number(menu.pricePerPlate).toFixed(2)} / plate</span>
        </div>
      </>
    ),
    listRow: (
      <>
        <TableCell className="font-medium">{menu.name}</TableCell>
        <TableCell>
          <Badge variant={menu.menuType === "NON_VEGETARIAN" ? "destructive" : "default"}>
            {menu.menuType === "NON_VEGETARIAN" ? "Non-Veg" : "Veg"}
          </Badge>
        </TableCell>
        <TableCell>₹{Number(menu.pricePerPlate).toFixed(2)}</TableCell>
        <TableCell>
          <Badge variant={menu.isActive ? "default" : "secondary"}>{menu.isActive ? "Active" : "Inactive"}</Badge>
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">Menu Types</h1>
        <p className="text-sm text-muted-foreground">Priced, sellable menu types built from your catalog.</p>
      </div>

      <CatalogBrowser
        entries={entries}
        newHref="/menu-catalog/menus/new"
        newLabel="Add New Menu Type"
        searchPlaceholder="Search menu types…"
        emptyLabel="No menu types yet."
        listColumnCount={4}
      />
    </div>
  );
}
