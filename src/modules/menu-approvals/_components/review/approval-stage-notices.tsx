"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import { BANNER_CLASS, formatDateTime, stageBanner } from "./approval-format";

/**
 * What the team sees under the header while the live menu is on screen: the stage banner, the customer link with Copy link, the
 * venue & delivery status and, once sent to the kitchen, the lock note. Renders nothing for a frozen version (the caller skips it).
 */
export function ApprovalStageNotices({
  status,
  statusLabel,
  currentVersion,
  withCustomer,
  liveUrl,
  venueDetailsSubmittedAt,
  lockedAt,
}: {
  status: MenuSelectionStatus;
  statusLabel: string;
  currentVersion: number;
  withCustomer: boolean;
  liveUrl: string | null;
  /** ISO time the customer sent the Venue & Delivery details, or null. */
  venueDetailsSubmittedAt: string | null;
  lockedAt: Date | null;
}) {
  const banner = stageBanner(status, currentVersion, statusLabel);
  return (
    <>
      {banner && (
        <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4 text-sm ${BANNER_CLASS[banner.tone]}`}>
          <span className="flex items-start gap-2 font-medium">
            {banner.tone === "danger" && <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
            {banner.text}
          </span>
          {banner.noteLink && (
            <a href="#menu-notes" className="flex items-center gap-1 font-medium whitespace-nowrap hover:underline">
              {banner.noteLink}
              <ArrowRight className="size-4" />
            </a>
          )}
        </div>
      )}
      {withCustomer && liveUrl && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm">
          <span className="text-muted-foreground">Customer link:</span>
          <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{liveUrl}</code>
          <CopyButton value={liveUrl} label="Copy link" size="md" />
        </div>
      )}
      {(status === "CUSTOMER_APPROVED" || status === "FINAL_LOCKED") && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 text-sm" data-testid="venue-details-status">
          <span className="font-medium">Venue &amp; delivery details:</span>
          {venueDetailsSubmittedAt ? (
            <Badge variant="success">Received {formatDateTime(new Date(venueDetailsSubmittedAt))}</Badge>
          ) : (
            <>
              <Badge variant="warning">Waiting for the customer</Badge>
              {liveUrl && (
                <>
                  <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{liveUrl}</code>
                  <CopyButton value={liveUrl} label="Copy link" size="md" />
                </>
              )}
            </>
          )}
        </div>
      )}
      {status === "FINAL_LOCKED" && lockedAt && (
        <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Approved and sent to the kitchen on {formatDateTime(lockedAt)} — no further changes.
        </div>
      )}
    </>
  );
}
