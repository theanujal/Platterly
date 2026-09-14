import { notFound } from "next/navigation";
import { requireActiveOrganization } from "@/lib/auth/require-session";
import { getPackage } from "@/modules/menus/package";
import { listMenuItems } from "@/modules/menus/item";
import { EditPackageClient } from "./_components/edit-package-client";

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  const [pkg, items] = await Promise.all([getPackage(organizationId, id), listMenuItems(organizationId, { isActive: true })]);
  if (!pkg) notFound();

  const itemRows = items.map((item) => {
    const existing = pkg.items.find((i) => i.menuItemId === item.id);
    return {
      menuItemId: item.id,
      mode: !existing ? ("off" as const) : existing.isAddOn ? ("addon" as const) : existing.isOptional ? ("optional" as const) : ("included" as const),
      extraPrice: existing?.extraPrice != null ? existing.extraPrice.toString() : "",
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold">{pkg.name}</h1>
        <p className="text-sm text-muted-foreground">Edit this package.</p>
      </div>
      <EditPackageClient
        packageId={pkg.id}
        availableItems={items.map((i) => ({ id: i.id, name: i.name }))}
        initialValues={{
          name: pkg.name,
          description: pkg.description ?? "",
          imageUrl: pkg.image,
          pricingModel: pkg.pricingModel,
          fixedPrice: pkg.fixedPrice != null ? pkg.fixedPrice.toString() : "",
          perPersonPrice: pkg.perPersonPrice != null ? pkg.perPersonPrice.toString() : "",
          minGuests: pkg.minGuests != null ? pkg.minGuests.toString() : "",
          maxGuests: pkg.maxGuests != null ? pkg.maxGuests.toString() : "",
          itemRows,
        }}
      />
    </div>
  );
}
