import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MENU_SELECTION_STATUS_HINT, MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import { RecallMenuButton } from "./recall-menu-button";

/**
 * How the order's planner may be used, from the menu's approval status (AJ, 2026-10-10):
 * - editable: no approval yet, a draft, or the customer asked for changes. The planner below is the same one Menu Approvals uses and saves to the same place.
 * - recall: the menu is with the customer, or approved but not yet with the kitchen. Read-only until someone recalls it.
 * - locked: sent to the kitchen. View only.
 */
export type MenuPlanPhase = "editable" | "recall" | "locked";

export function menuPlanPhase(status: MenuSelectionStatus | null): MenuPlanPhase {
  if (status === null || status === "DRAFT" || status === "CHANGES_REQUESTED") return "editable";
  if (status === "FINAL_LOCKED") return "locked";
  return "recall";
}

/**
 * Sits above the planner on the Order's Guests & Menu Planning tab: where the menu is in the approval, in plain words,
 * and what the team can do next (Recall to edit, or open Menu Approvals).
 */
export function MenuStatusBanner({
  status,
  version,
  editHref,
  menuSelectionId,
  canRecall,
}: {
  status: MenuSelectionStatus | null;
  version: number | null;
  editHref: string | null;
  menuSelectionId: string | null;
  canRecall: boolean;
}) {
  const phase = menuPlanPhase(status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4" data-testid="menu-status-banner" data-phase={phase}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">Menu approval</span>
          {status ? (
            <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{MENU_SELECTION_STATUS_LABEL[status]}</Badge>
          ) : (
            <Badge variant="neutral">Not started</Badge>
          )}
          {status && version !== null && <span className="text-xs text-muted-foreground">Version {version}</span>}
        </div>
        <p className="text-sm text-muted-foreground">
          {status ? MENU_SELECTION_STATUS_HINT[status] : "Set an Event Type on this order and save it to start the menu approval."}
          {phase === "editable" && status && " You can edit the menu below; it saves with the order and shows in Menu Approvals."}
          {phase === "recall" && " The menu is read-only until it is recalled."}
          {phase === "locked" && " It is with the kitchen, so it can no longer be changed here."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {phase === "recall" && canRecall && menuSelectionId && <RecallMenuButton menuSelectionId={menuSelectionId} />}
        {editHref && (
          <Button variant="outline" render={<Link href={editHref} />} nativeButton={false}>
            Open Menu Approvals
          </Button>
        )}
      </div>
    </div>
  );
}
