import type { ReactNode } from "react";
import Link from "next/link";
import { Calendar, ConciergeBell, Users, Store, FileText } from "lucide-react";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardTitle } from "@/components/ui/card";
import { StageSelect } from "./stage-select";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";
import type { VariantProps } from "class-variance-authority";

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

/** The Menu(s) this Event Type is configured to offer — see menu-approval.ts's KITCHEN_PRODUCTION_INCLUDE comment for why this comes from the Event Type, not the individual selected items. */
function menuName(menus: { menu: { name: string } }[]): string {
  const names = [...new Set(menus.map((m) => m.menu.name))];
  if (names.length === 0) return "No menu assigned";
  return names.length === 1 ? names[0] : "Multiple menus";
}

export interface ProductionCardMenuSelection {
  id: string;
  kitchenProductionStatus: KitchenProductionStatus;
  event: {
    name: string;
    startDate: Date;
    guestCount: number | null;
    notes: string | null;
    customer: { name: string };
    eventType: { name: string; menus: { menu: { name: string } }[] };
    assignedKitchen: { name: string } | null;
  };
}

// Icon + text field, reused for the 2x2 detail grid below (AJ's reference
// screenshot, 2026-09-19) — always the same icon size/gap/color so the grid
// reads as one consistent block rather than four one-off rows.
function Field({ icon: Icon, children }: { icon: typeof Calendar; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-foreground">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {children}
    </span>
  );
}

export function ProductionCard({ menuSelection, showPriority = true }: { menuSelection: ProductionCardMenuSelection; showPriority?: boolean }) {
  const pr = priority(menuSelection.event.startDate);
  const menu = menuName(menuSelection.event.eventType.menus);

  return (
    <Card className="border border-border">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="font-semibold">{menuSelection.event.customer.name}</CardTitle>
          {showPriority && <Badge variant={pr.variant}>{pr.label}</Badge>}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {/* 2x2 detail grid: Event Type / Menu Name over Guests / Date, split by
            a single vertical divider — matches the reference exactly (AJ,
            2026-09-19), rather than the previous flex-wrap layout that
            re-wrapped unpredictably depending on label length. */}
        <div className="flex gap-4 rounded-lg border border-border py-2.5">
          <div className="flex flex-1 flex-col gap-2.5 px-3">
            <Field icon={Calendar}>{menuSelection.event.eventType.name}</Field>
            <Field icon={Users}>{menuSelection.event.guestCount ?? 0} guests</Field>
          </div>
          <div className="w-px shrink-0 bg-border" />
          <div className="flex flex-1 flex-col gap-2.5 px-3">
            <Field icon={ConciergeBell}>{menu}</Field>
            <Field icon={Calendar}>{formatDate(menuSelection.event.startDate)}</Field>
          </div>
        </div>
        {menuSelection.event.assignedKitchen && (
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Store className="size-3.5 shrink-0" />
            {menuSelection.event.assignedKitchen.name}
          </span>
        )}
        {menuSelection.event.notes && (
          <p className="flex items-start gap-1.5 rounded-md border border-border bg-muted/30 p-2 text-xs">
            <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <span>{menuSelection.event.notes}</span>
          </p>
        )}
        <div className="flex items-center justify-between gap-2 pt-1">
          <Link href={`/menu-approvals/${menuSelection.id}`} className="text-xs font-medium text-primary underline-offset-2 hover:underline">
            View Details →
          </Link>
          <StageSelect menuSelectionId={menuSelection.id} currentStage={menuSelection.kitchenProductionStatus} />
        </div>
      </CardContent>
    </Card>
  );
}
