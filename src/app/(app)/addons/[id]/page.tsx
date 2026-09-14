import { notFound } from "next/navigation";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getAddOn } from "@/modules/addons/addon";
import { EditAddOnClient } from "./_components/edit-addon-client";
import { AddOnRowActions } from "../_components/addon-row-actions";

export default async function EditAddOnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["edit"] }, organizationId);
  const addOn = await getAddOn(organizationId, id);
  if (!addOn) notFound();

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">{addOn.name}</h1>
          <p className="text-sm text-muted-foreground">Edit this add-on.</p>
        </div>
        <AddOnRowActions addOnId={addOn.id} name={addOn.name} />
      </div>
      <EditAddOnClient
        addOnId={addOn.id}
        initialValues={{
          name: addOn.name,
          description: addOn.description ?? "",
          type: addOn.type,
          priceType: addOn.priceType,
          price: addOn.price.toString(),
          imageUrl: addOn.image,
          isActive: addOn.isActive,
        }}
      />
    </div>
  );
}
