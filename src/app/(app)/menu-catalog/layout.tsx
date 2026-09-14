import Link from "next/link";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";

const NAV_ITEMS = [
  { label: "Categories", href: "/menu-catalog/categories" },
  { label: "Items", href: "/menu-catalog/items" },
  { label: "Menus", href: "/menu-catalog/menus" },
  { label: "Packages", href: "/menu-catalog/packages" },
] as const;

// Chunk 6 — Menu & Product Catalog. Same "always-show nav, gate on visit"
// convention as Settings/Super Admin: every leaf page enforces its own
// `menus` permission via requirePermission, this layout only requires an
// active organization to exist.
export default async function MenuCatalogLayout({ children }: { children: React.ReactNode }) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  return (
    <div className="flex flex-1 flex-col gap-6 p-8 md:flex-row">
      <nav className="flex shrink-0 flex-col gap-1 md:w-48">
        <h2 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Menu Catalog
        </h2>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-md px-2 py-1.5 text-sm text-foreground hover:bg-muted"
          >
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
