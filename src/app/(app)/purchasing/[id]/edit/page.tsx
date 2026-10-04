import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { assertSharedOrAtMyLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getPurchaseOrder } from "@/modules/purchasing/purchase-order";
import { listSupplierOptions } from "@/modules/suppliers/supplier";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { PurchaseOrderForm } from "../../_components/purchase-order-form";

export const metadata: Metadata = {
  title: "Edit Purchase Order — Platterly",
  robots: { index: false, follow: false },
};

export default async function EditPurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ inventory: ["edit"] }, organizationId);
  const po = await getPurchaseOrder(organizationId, id);
  if (!po) notFound();
  await assertSharedOrAtMyLocation(organizationId, session.user.id, po.kitchenId);
  if (po.status !== "DRAFT") redirect(`/purchasing/${id}`);
  const [suppliers, inventory] = await Promise.all([listSupplierOptions(organizationId, po.supplierId), listInventoryItems(organizationId, po.kitchenId)]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Purchasing", href: "/purchasing" }, { label: po.number, href: `/purchasing/${id}` }, { label: "Edit" }]} />
      <h1 className="text-2xl font-semibold">Edit {po.number}</h1>
      <Separator />
      <PurchaseOrderForm
        poId={po.id}
        suppliers={suppliers}
        options={inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit) }))}
        initialValues={{
          supplierId: po.supplierId,
          expectedDate: po.expectedDate ? po.expectedDate.toISOString().slice(0, 10) : "",
          notes: po.notes ?? "",
          items: po.items.map((i) => ({ inventoryId: i.inventoryId, quantity: String(Number(i.quantity)), unitCost: String(Number(i.unitCost)) })),
        }}
      />
    </div>
  );
}
