import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listKitchenProductionQueue } from "@/modules/menu-approvals/menu-approval";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ProductionCard } from "../_components/production-card";

export const metadata: Metadata = {
  title: "Delivered Orders — Kitchen Dashboard — Platterly",
  robots: { index: false, follow: false },
};

export default async function DeliveredOrdersPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  const menuSelections = await listKitchenProductionQueue(organizationId, ["COMPLETED"]);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kitchen Dashboard", href: "/kitchen-dashboard" }, { label: "Delivered Orders" }]}
      />
      <div>
        <h1 className="text-2xl font-semibold">Delivered Orders</h1>
        <p className="text-sm text-muted-foreground">Every menu the kitchen has marked Completed, across all dates.</p>
      </div>
      <Separator />

      {menuSelections.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No delivered orders yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {menuSelections.map((menuSelection) => (
            <ProductionCard key={menuSelection.id} menuSelection={menuSelection} showPriority={false} />
          ))}
        </div>
      )}
    </div>
  );
}
