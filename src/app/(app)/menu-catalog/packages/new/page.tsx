import { requireActiveOrganization } from "@/lib/auth/require-session";
import { listMenuItems } from "@/modules/menus/item";
import { NewPackageClient } from "./_components/new-package-client";

export default async function NewPackagePage() {
  const { organizationId } = await requireActiveOrganization();
  const items = await listMenuItems(organizationId, { isActive: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">New Package</h1>
        <p className="text-sm text-muted-foreground">Bundle catalog items into a priced package for Quotations/Orders.</p>
      </div>
      <NewPackageClient availableItems={items.map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
