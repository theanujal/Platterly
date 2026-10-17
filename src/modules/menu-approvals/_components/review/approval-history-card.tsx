"use client";

import { Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import { formatCurrency, formatDateTime } from "./approval-format";
import type { VersionView } from "./types";

/**
 * Every menu version sent to the customer, newest first, each opening in the planner. Lives in the Approval Status card's "View approval
 * history" dialog (it was the sidebar's Menu History card); `onOpened` closes that dialog once a version is opened.
 */
export function ApprovalVersionRows({
  versions,
  currentVersion,
  status,
  statusLabel,
  onOpenVersion,
  onOpened,
  showPrices = true,
}: {
  showPrices?: boolean;
  versions: VersionView[];
  currentVersion: number;
  status: MenuSelectionStatus;
  statusLabel: string;
  onOpenVersion: (versionNumber: number) => void;
  onOpened: () => void;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid="menu-history-card">
      <span className="text-sm font-medium">Menu versions</span>
      {versions.length === 0 ? (
        <p className="text-xs text-muted-foreground">Version {currentVersion} hasn&apos;t been sent to the customer yet.</p>
      ) : (
        versions.map((version) => (
          <div key={version.versionNumber} className="flex flex-col gap-1.5 rounded-lg border border-border p-3 text-sm" data-testid="menu-version-row">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-medium">
                Version {version.versionNumber}
                {version.versionNumber === currentVersion && <span className="text-xs font-normal text-muted-foreground">Current</span>}
              </span>
              {version.superseded ? <Badge variant="neutral">Replaced</Badge> : <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{statusLabel}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              Sent {formatDateTime(version.sentAt ?? version.createdAt)}
              {version.snapshot && showPrices ? ` · ${formatCurrency(version.snapshot.total)}` : ""}
            </p>
            <Button
              type="button"
              variant="outline"
              size="md"
              className="w-fit"
              onClick={() => {
                onOpenVersion(version.versionNumber);
                onOpened();
              }}
            >
              <Eye data-icon="inline-start" />
              View version
            </Button>
          </div>
        ))
      )}
    </div>
  );
}
