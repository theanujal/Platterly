import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, PackageCheck, Truck } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listKitchenProductionBoard } from "@/modules/menu-approvals/menu-approval";
import { getKitchenRules } from "@/modules/kitchen/kitchen-rules";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ProductionCard, DeliveredCard } from "./_components/production-card";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Kitchen Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Four columns (AJ, 2026-09-30): the 3 in-flight stages plus Delivered, which shows a small info card.
const COLUMNS: { key: KitchenProductionStatus; label: string; icon: LucideIcon; header: string; icon_tint: string }[] = [
  { key: "PENDING", label: "Pending", icon: Clock, header: "bg-secondary", icon_tint: "text-foreground" },
  { key: "IN_PREPARATION", label: "In Preparation", icon: ChefHat, header: "bg-tone-teal/10", icon_tint: "text-tone-teal" },
  { key: "READY", label: "Ready", icon: PackageCheck, header: "bg-info/10", icon_tint: "text-info" },
  { key: "DELIVERED", label: "Delivered", icon: Truck, header: "bg-success/10", icon_tint: "text-success" },
];

export default async function KitchenDashboardPage() {
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ menus: ["view"] }, organizationId);

  const [menuSelections, { daysBeforeEvent }] = await Promise.all([listKitchenProductionBoard(organizationId, locationId), getKitchenRules(organizationId)]);
  const windowText = daysBeforeEvent === 0 ? "today" : `today through the next ${daysBeforeEvent} ${daysBeforeEvent === 1 ? "day" : "days"}`;

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kitchen Dashboard" }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kitchen Dashboard</h1>
          <p className="text-sm text-muted-foreground">Confirmed menus in production from {windowText}, through to delivery.</p>
        </div>
        <Button variant="outline" render={<Link href="/kitchen-dashboard/production" />} nativeButton={false}>
          Production Planning
        </Button>
      </div>
      <Separator />

      {menuSelections.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nothing in production for {windowText} — confirmed menus show up here once the kitchen team approves them in Menu Approvals.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((column) => {
            const staged = menuSelections.filter((menuSelection) => menuSelection.kitchenProductionStatus === column.key);
            const Icon = column.icon;
            return (
              <div key={column.key} data-stage={column.key} className="flex flex-col gap-3">
                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${column.header}`}>
                  <Icon className={`size-4.5 shrink-0 ${column.icon_tint}`} />
                  <h2 className="font-semibold">{column.label}</h2>
                  <Badge variant="secondary" className="ml-auto">
                    {staged.length}
                  </Badge>
                </div>
                <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                  {staged.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing here.</p>
                  ) : (
                    staged.map((menuSelection) =>
                      column.key === "DELIVERED" ? (
                        <DeliveredCard key={menuSelection.id} menuSelection={menuSelection} />
                      ) : (
                        <ProductionCard key={menuSelection.id} menuSelection={menuSelection} />
                      ),
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
