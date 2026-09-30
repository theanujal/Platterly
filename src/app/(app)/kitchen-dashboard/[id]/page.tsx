import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDays, ClipboardList, ConciergeBell, MapPin, Users } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getKitchenPrepSheet } from "@/modules/menu-approvals/menu-approval";
import { MEAL_TYPE_LABEL } from "@/modules/menu-approvals/approval-snapshot";
import { KITCHEN_PRODUCTION_STATUS_LABEL } from "@/modules/menu-approvals/kitchen-production-status";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { PrepSheetActions } from "../_components/prep-sheet-actions";
import { PrepMeals } from "../_components/prep-meals";
import { StageActions } from "../_components/stage-actions";
import type { KitchenProductionStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Preparation Sheet — Kitchen Dashboard — Platterly",
  robots: { index: false, follow: false },
};

const STAGE_BADGE: Record<KitchenProductionStatus, "neutral" | "info" | "success" | "danger"> = {
  PENDING: "neutral",
  IN_PREPARATION: "info",
  READY: "info",
  DELIVERED: "success",
  CANCELLED: "danger",
};

const formatDate = (date: Date, options: Intl.DateTimeFormatOptions) => date.toLocaleDateString("en-IN", { timeZone: "UTC", ...options });

// Read-only "what do we cook" sheet for the kitchen (AJ, 2026-09-30, from his
// screenshot). The kitchen role has no menus:approve, so linking to
// /menu-approvals/[id] sent it to a closed page — this route needs only
// menus:view (moving the stage needs menus:edit, checked by the action).
export default async function KitchenPrepSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ menus: ["view"] }, organizationId);

  const sheet = await getKitchenPrepSheet(organizationId, id);
  if (!sheet) notFound();
  const { selection, meals, guests, extraPercent, isMultiOrder, kitchenNotes } = sheet;
  const { event } = selection;

  const menuNames = [...new Set(meals.map((m) => m.menuName).filter((n): n is string => Boolean(n)))];
  const notes = [kitchenNotes, event.notes].filter((n): n is string => Boolean(n?.trim()));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb
        items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Kitchen Dashboard", href: "/kitchen-dashboard" }, { label: event.customer.name }]}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{event.customer.name}</h1>
            <Badge variant={STAGE_BADGE[selection.kitchenProductionStatus]}>{KITCHEN_PRODUCTION_STATUS_LABEL[selection.kitchenProductionStatus]}</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {[event.order?.orderNumber, event.eventType.name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <PrepSheetActions pdfUrl={`/kitchen-dashboard/${selection.id}/pdf`} />
          <StageActions menuSelectionId={selection.id} currentStage={selection.kitchenProductionStatus} />
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <span className="flex items-center gap-2">
          <CalendarDays className="size-4 text-muted-foreground" />
          {formatDate(event.startDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          {guests} guests
        </span>
        {menuNames.length > 0 && (
          <span className="flex items-center gap-2">
            <ConciergeBell className="size-4 text-muted-foreground" />
            {menuNames.join(", ")}
          </span>
        )}
        <span className="flex items-center gap-2">
          <MapPin className="size-4 text-muted-foreground" />
          {event.assignedKitchen?.name ?? "Not assigned"}
        </span>
      </div>

      {meals.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No dishes have been planned for this order yet.</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <PrepMeals
            guests={guests}
            extraPercent={extraPercent}
            isMultiOrder={isMultiOrder}
            meals={meals.map((meal) => ({
              key: `${meal.date.toISOString()}|${meal.mealType}`,
              label: MEAL_TYPE_LABEL[meal.mealType],
              dateLabel: formatDate(meal.date, { weekday: "short", day: "numeric", month: "short" }),
              menuName: meal.menuName,
              categories: meal.categories,
            }))}
          />
          <aside className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="Preparation notes">
            <div className="flex items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ClipboardList className="size-4.5" />
              </span>
              <h2 className="font-semibold">Preparation Notes</h2>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 text-sm whitespace-pre-line">
              {notes.length > 0 ? (
                notes.map((note, i) => <p key={i}>{note}</p>)
              ) : (
                <p className="text-muted-foreground">No preparation notes for this order. Anything the team adds under Kitchen Notes on the order shows up here.</p>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
