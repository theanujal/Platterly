import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listSupplierOptions } from "@/modules/suppliers/supplier";
import { listInventoryItems } from "@/modules/inventory/inventory";
import { suggestReorder } from "@/modules/purchasing/purchase-order";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { PurchaseOrderForm, type PurchaseOrderFormValues } from "../_components/purchase-order-form";

export const metadata: Metadata = {
  title: "New Purchase Order — Platterly",
  robots: { index: false, follow: false },
};

/** `?from=low-stock` starts the request with everything at or below its alert; `?items=id:qty,id:qty` starts it with those (from production planning). */
export default async function NewPurchaseOrderPage({ searchParams }: { searchParams: Promise<{ from?: string; items?: string }> }) {
  const { from, items: itemsParam } = await searchParams;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ inventory: ["create"] }, organizationId);
  const [suppliers, inventory] = await Promise.all([listSupplierOptions(organizationId), listInventoryItems(organizationId)]);
  const options = inventory.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit === null ? null : Number(i.costPerUnit) }));
  const known = new Map(options.map((o) => [o.id, o]));

  let seeded: PurchaseOrderFormValues["items"] = [];
  if (itemsParam) {
    seeded = itemsParam
      .split(",")
      .map((pair) => pair.split(":"))
      .filter(([id, qty]) => known.has(id) && Number.parseFloat(qty) > 0)
      .map(([id, qty]) => ({ inventoryId: id, quantity: String(Number.parseFloat(qty)), unitCost: known.get(id)?.costPerUnit != null ? String(known.get(id)?.costPerUnit) : "" }));
  } else if (from === "low-stock") {
    seeded = (await suggestReorder(organizationId)).map((s) => ({ inventoryId: s.id, quantity: String(s.suggested), unitCost: s.costPerUnit !== null ? String(s.costPerUnit) : "" }));
  }

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Purchasing", href: "/purchasing" }, { label: "New order" }]} />
      <div>
        <h1 className="text-2xl font-semibold">New purchase order</h1>
        <p className="text-sm text-muted-foreground">Saved as a draft (the purchase request). Mark it as ordered when it goes to the supplier.</p>
      </div>
      <Separator />
      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground">Add a supplier first (Suppliers in the left menu).</p>
      ) : (
        <PurchaseOrderForm suppliers={suppliers} options={options} initialValues={{ supplierId: "", expectedDate: "", notes: "", items: seeded.length > 0 ? seeded : [{ inventoryId: "", quantity: "", unitCost: "" }] }} />
      )}
    </div>
  );
}
