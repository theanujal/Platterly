"use client";

import { Eye, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import { formatCurrency, formatDateTime } from "./approval-format";
import type { VersionView } from "./types";

/** "Menu History": the latest two versions as a small timeline; "View All" opens every version. */
export function ApprovalHistoryCard({
  versions,
  currentVersion,
  status,
  statusLabel,
  viewVersion,
  onOpenVersion,
  onViewAll,
}: {
  /** Newest first. */
  versions: VersionView[];
  currentVersion: number;
  status: MenuSelectionStatus;
  statusLabel: string;
  viewVersion: number | null;
  onOpenVersion: (versionNumber: number) => void;
  onViewAll: () => void;
}) {
  const latestVersions = versions.slice(0, 2);
  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="menu-history-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <History className="size-5" />
        </span>
        <h2 className="min-w-0 flex-1 text-base font-semibold">Menu History</h2>
        {versions.length > 2 && (
          <Button type="button" variant="link" size="sm" className="px-0 text-info" onClick={onViewAll}>
            View All
          </Button>
        )}
      </div>
      {latestVersions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Version {currentVersion} hasn&apos;t been sent to the customer yet.</p>
      ) : (
        <ol className="flex flex-col" aria-label="Menu version history">
          {latestVersions.map((version, index) => {
            const isLatest = index === 0;
            const isLast = index === latestVersions.length - 1;
            const viewing = viewVersion === version.versionNumber;
            return (
              <li key={version.versionNumber} className="flex gap-3 text-sm" data-testid="menu-version-summary">
                <div className="flex flex-col items-center pt-1.5">
                  <span className={`size-3 shrink-0 rounded-full ${isLatest ? "bg-primary" : "bg-primary/60"}`} />
                  {!isLast && <span className="my-1 w-0.5 flex-1 bg-border" />}
                </div>
                <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${isLast ? "" : "pb-4"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenVersion(version.versionNumber)}
                      className={`font-semibold hover:underline ${viewing ? "text-primary" : ""}`}
                      aria-label={`View version ${version.versionNumber}`}
                    >
                      Version {version.versionNumber}
                    </button>
                    {version.superseded ? (
                      <Badge variant="neutral">Superseded</Badge>
                    ) : (
                      <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{statusLabel}</Badge>
                    )}
                  </div>
                  <span className="text-muted-foreground">Sent on {formatDateTime(version.sentAt ?? version.createdAt)}</span>
                  {version.snapshot && <span className="text-xs text-muted-foreground">{formatCurrency(version.snapshot.total)}</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

/** Every version, each one opening in the planner. */
export function ApprovalVersionDialog({
  open,
  onOpenChange,
  versions,
  currentVersion,
  status,
  statusLabel,
  onOpenVersion,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: VersionView[];
  currentVersion: number;
  status: MenuSelectionStatus;
  statusLabel: string;
  onOpenVersion: (versionNumber: number) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Menu version history</DialogTitle>
          <DialogDescription>
            Every time the menu is sent to the customer, that version is saved as it was sent. Open one to see it in the planner.
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {versions.map((version) => (
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
                {version.snapshot ? ` · ${formatCurrency(version.snapshot.total)}` : ""}
              </p>
              <Button type="button" variant="outline" size="md" className="w-fit" onClick={() => onOpenVersion(version.versionNumber)}>
                <Eye data-icon="inline-start" />
                View version
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
