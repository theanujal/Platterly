import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MENU_SELECTION_STATUS_HINT, MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

/**
 * Sits above the read-only planner on the Order's Guests & Menu Planning tab (AJ, 2026-09-30): where the menu is in
 * the approval, in plain words, and the Edit Menu button that takes the team to Menu Approvals.
 */
export function MenuStatusBanner({ status, version, editHref }: { status: MenuSelectionStatus | null; version: number | null; editHref: string | null }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 p-4" data-testid="menu-status-banner">
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
        </p>
      </div>
      {editHref && (
        <Button variant="outline" render={<Link href={editHref} />} nativeButton={false}>
          Edit Menu
        </Button>
      )}
    </div>
  );
}
