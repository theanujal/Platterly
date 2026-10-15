"use client";

import { ArrowLeft, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "./approval-format";
import type { VersionView } from "./types";

/** The "Viewing Version N — read only" bar with Compare and Back to current, plus the note for a version sent before dishes were saved by id. */
export function ApprovalVersionBar({
  viewVersion,
  shownVersion,
  versionHasDishIds,
  compareOn,
  onToggleCompare,
  onBack,
}: {
  /** The N of ?version=N (always set when this renders). */
  viewVersion: number;
  shownVersion: VersionView | null;
  versionHasDishIds: boolean;
  compareOn: boolean;
  onToggleCompare: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <span className="flex items-center gap-2 font-medium text-warning">
          <Eye className="size-4" />
          {shownVersion
            ? `Viewing Version ${shownVersion.versionNumber}${shownVersion.sentAt ? `, sent ${formatDateTime(shownVersion.sentAt)}` : ""} — read only`
            : `Version ${viewVersion} wasn't found.`}
        </span>
        <span className="flex flex-wrap items-center gap-2">
          {shownVersion && (
            <Button type="button" variant={compareOn ? "default" : "outline"} size="md" disabled={!versionHasDishIds} aria-pressed={compareOn} onClick={onToggleCompare}>
              {compareOn ? "Hide Compare" : "Compare with current"}
            </Button>
          )}
          <Button type="button" variant="outline" size="md" onClick={onBack}>
            <ArrowLeft data-icon="inline-start" />
            Back to current
          </Button>
        </span>
      </div>
      {shownVersion && !versionHasDishIds && (
        <p className="text-xs text-muted-foreground">
          This version was sent before dishes were saved by id, so it can be viewed but not compared dish by dish.
        </p>
      )}
    </>
  );
}
