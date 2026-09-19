import type { Metadata } from "next";
import Link from "next/link";
import { Clock, ChefHat, PackageCheck, Truck, Ban } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listKitchenProductionBoard } from "@/modules/menu-approvals/menu-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { ProductionCard } from "./_components/production-card";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Kitchen Dashboard — Platterly",
  robots: { index: false, follow: false },
};

// Only the 3 "in flight" stages get a board column (AJ, 2026-09-19) —
// Completed/Cancelled move off the board entirely onto their own list pages
// (the two buttons in the header), see menu-approval.ts's board-vs-queue split.
const COLUMNS: { key: KitchenProductionStatus; label: string; icon: LucideIcon; header: string; icon_tint: string }[] = [
  { key: "PENDING", label: "Pending", icon: Clock, header: "bg-secondary", icon_tint: "text-foreground" },
  { key: "PREPARING", label: "Preparing", icon: ChefHat, header: "bg-warning/10", icon_tint: "text-warning" },
  { key: "READY", label: "Ready", icon: PackageCheck, header: "bg-info/10", icon_tint: "text-info" },
];

export default async function KitchenDashboardPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  const menuSelections = await listKitchenProductionBoard(organizationId);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kitchen Dashboard" }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Kitchen Dashboard</h1>
          <p className="text-sm text-muted-foreground">Every confirmed menu, from today&apos;s production through to completed events.</p>
        </div>
        <div className="flex gap-2">
          {/*
            size="md" (h-[38px]), not default (AJ, 2026-09-19) — these are
            secondary tab-style navigation into the Delivered/Cancelled
            sub-views, not the one dominant page action the way "Create
            Order" is elsewhere; reserve default (h-11) for that role and use
            the same medium size every other secondary/card action uses.
          */}
          <Button
            variant="outline"
            size="md"
            className="border-success/30 bg-success/10 text-success hover:bg-success/20"
            render={<Link href="/kitchen-dashboard/delivered" />}
            nativeButton={false}
          >
            <Truck data-icon="inline-start" />
            Delivered Orders
          </Button>
          <Button
            variant="outline"
            size="md"
            className="border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
            render={<Link href="/kitchen-dashboard/cancelled" />}
            nativeButton={false}
          >
            <Ban data-icon="inline-start" />
            Cancelled Orders
          </Button>
        </div>
      </div>
      <Separator />

      {menuSelections.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nothing in production for today through the next 2 days — confirmed menus show up here once the kitchen locks them in Menu Approvals.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
                    staged.map((menuSelection) => <ProductionCard key={menuSelection.id} menuSelection={menuSelection} />)
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
