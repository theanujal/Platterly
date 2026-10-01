"use client";

import { useState } from "react";
import Link from "next/link";
import { ShoppingBasket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

interface OrderApprovalPanelProps {
  /** Null when no menu selection exists for this order yet. */
  approval: {
    menuSelectionId: string;
    status: MenuSelectionStatus;
    currentVersion: number;
    venueDetailsSubmittedAt: Date | null;
    versions: { versionNumber: number; status: MenuSelectionStatus; note: string | null; sentAt: Date | null; supersededAt: Date | null }[];
  } | null;
  /** Same permission as the Menu Approvals page — without it the link would lead nowhere. */
  canManage: boolean;
}

/** Sent to the kitchen: nothing left for the team to do, so no shortcut to Menu Approvals. */
const DONE: MenuSelectionStatus[] = ["FINAL_LOCKED"];

const fmt = (d: Date | null) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : null;

/**
 * The Order page's read-only view of the menu approval: the latest two versions
 * and their status. Sending, recalling and reviewing all happen on the Menu
 * Approvals page (AJ, 2026-09-30), so the only control here is a link there,
 * shown while something is still pending.
 */
export function OrderApprovalPanel({ approval, canManage }: OrderApprovalPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const status = approval?.status ?? null;
  // Latest two versions; before the first send, one placeholder step so the card looks the same from the start.
  const sentVersions = approval?.versions ?? [];
  const steps =
    sentVersions.length > 0
      ? sentVersions.slice(0, 2).map((v, i) => ({
          versionNumber: v.versionNumber,
          sentAt: v.sentAt,
          note: v.note,
          badge:
            i === 0 && v.supersededAt
              ? { variant: "neutral" as const, label: "Replaced" }
              : { variant: MENU_SELECTION_STATUS_TONE[v.status], label: MENU_SELECTION_STATUS_LABEL[v.status] },
        }))
      : [
          {
            versionNumber: approval?.currentVersion ?? 1,
            sentAt: null,
            note: null,
            badge: status
              ? { variant: MENU_SELECTION_STATUS_TONE[status], label: MENU_SELECTION_STATUS_LABEL[status] }
              : { variant: "neutral" as const, label: "Not sent" },
          },
        ];
  const showLink = canManage && (status === null || !DONE.includes(status));
  const linkHref = approval ? `/menu-approvals/${approval.menuSelectionId}` : "/menu-approvals";

  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="order-approval-panel">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ShoppingBasket className="size-5" />
        </span>
        <h2 className="min-w-0 flex-1 text-base font-semibold">Menu History</h2>
        {sentVersions.length > 0 && (
          <Button type="button" variant="link" size="sm" className="px-0 text-info" onClick={() => setHistoryOpen(true)}>
            View History
          </Button>
        )}
      </div>

      <ol className="flex flex-col" aria-label="Menu version history">
        {steps.map((step, index) => {
          const isLatest = index === 0;
          const isLast = index === steps.length - 1;
          return (
            <li key={step.versionNumber} className="flex gap-3 text-sm" data-testid="menu-version-summary">
              {/* Dot and the line down to the next step */}
              <div className="flex flex-col items-center pt-1.5">
                <span className={`size-3 shrink-0 rounded-full ${isLatest ? "bg-primary" : "bg-primary/60"}`} />
                {!isLast && <span className="my-1 w-0.5 flex-1 bg-border" />}
              </div>
              <div className={`flex min-w-0 flex-1 flex-col gap-0.5 ${isLast ? "" : "pb-4"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Version {step.versionNumber}</span>
                  {isLatest && <Badge variant={step.badge.variant}>{step.badge.label}</Badge>}
                </div>
                <span className="text-muted-foreground">{step.sentAt ? `Sent on ${fmt(step.sentAt)}` : "Not sent to the customer yet"}</span>
                {step.note && <span className="text-xs text-muted-foreground">{step.note}</span>}
              </div>
            </li>
          );
        })}
      </ol>

      {(status === "CUSTOMER_APPROVED" || status === "FINAL_LOCKED") && (
        <p className="flex flex-wrap items-center gap-2 text-sm" data-testid="venue-details-status">
          <span className="font-medium">Venue details:</span>
          {approval?.venueDetailsSubmittedAt ? <Badge variant="success">Received {fmt(approval.venueDetailsSubmittedAt)}</Badge> : <Badge variant="warning">Waiting for the customer</Badge>}
        </p>
      )}

      {showLink && (
        <Button size="md" variant="outline" className="w-fit" render={<Link href={linkHref} />} nativeButton={false}>
          Open in Menu Approvals
        </Button>
      )}

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Menu version history</DialogTitle>
            <DialogDescription>
              Every time the menu is sent to the customer, that version is saved as it was sent. Only the latest version can be approved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {(approval?.versions ?? []).map((version) => {
              const isCurrent = version.versionNumber === approval?.currentVersion;
              return (
                <div key={version.versionNumber} className="flex flex-col gap-1.5 rounded-lg border border-border p-3" data-testid="menu-version-row">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      Version {version.versionNumber}
                      {isCurrent && <span className="ml-2 text-xs font-normal text-muted-foreground">Current</span>}
                    </span>
                    {version.supersededAt ? (
                      <Badge variant="neutral">Replaced</Badge>
                    ) : (
                      <Badge variant={MENU_SELECTION_STATUS_TONE[version.status]}>{MENU_SELECTION_STATUS_LABEL[version.status]}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {version.sentAt ? `Sent ${fmt(version.sentAt)}` : "Not sent"}
                    {version.supersededAt ? ` · Replaced ${fmt(version.supersededAt)}` : ""}
                  </p>
                  {version.note && <p className="text-sm">{version.note}</p>}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
