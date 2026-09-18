import type { Metadata } from "next";
import Link from "next/link";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listKitchenProductionQueue } from "@/modules/menu-approvals/menu-approval";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { AdvanceStageButton } from "./_components/advance-stage-button";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";
import type { VariantProps } from "class-variance-authority";

export const metadata: Metadata = {
  title: "Kitchen Dashboard — Platterly",
  robots: { index: false, follow: false },
};

const STAGES: { key: KitchenProductionStatus; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY", label: "Ready" },
  { key: "COMPLETED", label: "Completed" },
];

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Shared neutral/info/warning/success/danger legend (AJ, 2026-09-19) — Today
// and Overdue used to both render "destructive" (same red for two different
// urgency levels); Overdue is the one that's actually gone wrong.
function priority(eventDate: Date): { label: string; variant: NonNullable<VariantProps<typeof badgeVariants>["variant"]> } {
  const days = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return { label: "Overdue", variant: "danger" };
  if (days === 0) return { label: "Today", variant: "warning" };
  if (days === 1) return { label: "Tomorrow", variant: "info" };
  return { label: `In ${days} days`, variant: "neutral" };
}

export default async function KitchenDashboardPage() {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  const menuSelections = await listKitchenProductionQueue(organizationId);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kitchen Dashboard" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Kitchen Dashboard</h1>
        <p className="text-sm text-muted-foreground">Every locked menu, from today&apos;s production through to completed events.</p>
      </div>
      <Separator />

      {menuSelections.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No locked menus yet — approved menus show up here once the kitchen locks them in Menu Approvals.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STAGES.map((stage) => {
            const staged = menuSelections.filter((menuSelection) => menuSelection.kitchenProductionStatus === stage.key);
            return (
              <div key={stage.key} data-stage={stage.key} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{stage.label}</h2>
                  <Badge variant="secondary">{staged.length}</Badge>
                </div>
                <div className="flex flex-col gap-3">
                  {staged.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing here.</p>
                  ) : (
                    staged.map((menuSelection) => {
                      const pr = priority(menuSelection.event.startDate);
                      return (
                        <Card key={menuSelection.id}>
                          <CardHeader>
                            <div className="flex items-start justify-between gap-2">
                              <CardTitle>{menuSelection.event.customer.name}</CardTitle>
                              <Badge variant={pr.variant}>{pr.label}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="flex flex-col gap-2 text-sm">
                            <p className="text-muted-foreground">
                              {menuSelection.event.name} • {menuSelection.event.eventType.name}
                            </p>
                            <p className="text-muted-foreground">
                              {formatDate(menuSelection.event.startDate)}
                              {menuSelection.event.guestCount ? ` • ${menuSelection.event.guestCount} guests` : ""}
                            </p>
                            {menuSelection.event.assignedKitchen && <p className="text-muted-foreground">{menuSelection.event.assignedKitchen.name}</p>}
                            <ul className="flex flex-col gap-0.5">
                              {menuSelection.items.map((item) => (
                                <li key={item.id}>
                                  {item.name} × {item.quantity}
                                </li>
                              ))}
                            </ul>
                            {menuSelection.event.notes && <p className="rounded-md border border-border bg-muted/30 p-2 text-xs">{menuSelection.event.notes}</p>}
                            <Link href={`/menu-approvals/${menuSelection.id}`} className="text-xs text-muted-foreground underline underline-offset-2">
                              View details
                            </Link>
                            <AdvanceStageButton menuSelectionId={menuSelection.id} currentStage={stage.key} />
                          </CardContent>
                        </Card>
                      );
                    })
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
