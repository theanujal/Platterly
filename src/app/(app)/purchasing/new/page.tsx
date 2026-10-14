import type { Metadata } from "next";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listSupplierOptions, listSupplierProductMap } from "@/modules/suppliers/supplier";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { suggestReorder } from "@/modules/purchasing/purchase-order";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { PurchaseOrderForm, type PurchaseOrderFormValues } from "../_components/purchase-order-form";

export const metadata: Metadata = {
  title: "New Purchase Order — Caterly",
  robots: { index: false, follow: false },
};

/** `?from=low-stock` starts the request with everything at or below its alert; `?items=id:qty,id:qty` starts it with those (from production planning). */
export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ from?: string; items?: string }> }) {
  const { from, items: itemsParam } = await searchParams;
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ inventory: ["create"] }, organizationId);
  const [suppliers, inventory, supplierProducts] = await Promise.all([listSupplierOptions(organizationId), listInventoryItems(organizationId, locationId), listSupplierProductMap(organizationId)]);
  const options = inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit }));
  const known = new Map(options.map((o) => [o.id, o]));

  let seeded: PurchaseOrderFormValues["items"] = [];
  if (itemsParam) {
    seeded = itemsParam
      .split(",")
      .map((pair) => pair.split(":"))
      .filter(([id, qty]) => known.has(id) && Number.parseFloat(qty) > 0)
      .map(([id, qty]) => ({ inventoryId: id, quantity: String(Number.parseFloat(qty)) }));
  } else if (from === "low-stock") {
    seeded = (await suggestReorder(organizationId, locationId)).map((s) => ({ inventoryId: s.id, quantity: String(s.suggested) }));
  }

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Purchasing", href: "/purchasing" }, { label: "New order" }]} />
      <div>
        <h1 className="text-2xl font-semibold">New purchase order</h1>
        <p className="text-sm text-muted-foreground">Saved as a draft (the purchase request). Send it to the supplier from the order page.</p>
      </div>
      <Separator />
      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a supplier first (Suppliers in the left menu).</p>
      ) : (
        <PurchaseOrderForm suppliers={suppliers} options={options} supplierProducts={supplierProducts} initialValues={{ supplierId: "", notes: "", items: seeded.length > 0 ? seeded : [{ inventoryId: "", quantity: "" }] }} />
      )}
    </div>
  );
}
