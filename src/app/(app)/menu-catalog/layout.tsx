import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { MenuCatalogNav } from "./_components/menu-catalog-nav";

// Chunk 6 — Menu & Product Catalog. Same "always-show nav, gate on visit"
// convention as Settings/Super Admin: every leaf page enforces its own
// `menus` permission via requirePermission, this layout only requires an
// active organization to exist.
export default async function MenuCatalogLayout({ children }: { children: React.ReactNode }) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <MenuCatalogNav />
      <div className="min-w-0 flex-1 p-8">{children}</div>
    </div>
  );
}
