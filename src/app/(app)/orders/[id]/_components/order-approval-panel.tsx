"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardCheck, History, Send, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CopyButton } from "@/components/ui/copy-button";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import { sendMenuForApprovalAction, recallMenuAction } from "../../../menu-approvals/actions";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

interface OrderApprovalPanelProps {
  orderId: string;
  /** Null until the order has been sent for approval once. */
  approval: {
    menuSelectionId: string;
    status: MenuSelectionStatus;
    currentVersion: number;
    versionCount: number;
    approvalUrl: string | null;
    versions: { versionNumber: number; status: MenuSelectionStatus; note: string | null; sentAt: Date | null; supersededAt: Date | null }[];
  } | null;
  /** Sending/recalling needs the same permission as the Menu Approvals page. */
  canManage: boolean;
}

const SENDABLE: MenuSelectionStatus[] = ["DRAFT", "CHANGES_REQUESTED", "KITCHEN_CHANGES_REQUESTED"];
const WITH_CUSTOMER: MenuSelectionStatus[] = ["SENT_TO_CUSTOMER", "CUSTOMER_REVIEWING"];

/**
 * The Order page's handle on the approval workflow: where staff send a placed
 * (or admin-created) order's menu to the customer. Orders stay the source of
 * truth; the Menu Approvals page is the work queue on top of it.
 */
export function OrderApprovalPanel({ orderId, approval, canManage }: OrderApprovalPanelProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"send" | "recall" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const status = approval?.status ?? null;
  const canSend = canManage && (status === null || SENDABLE.includes(status));
  const withCustomer = status !== null && WITH_CUSTOMER.includes(status);
  const liveUrl = sentUrl ?? approval?.approvalUrl ?? null;

  async function handleSend() {
    setError(null);
    setPending("send");
    const result = await sendMenuForApprovalAction({ orderId });
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentUrl(result.url);
    router.refresh();
  }

  async function handleRecall() {
    if (!approval) return;
    setError(null);
    setPending("recall");
    const result = await recallMenuAction(approval.menuSelectionId);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSentUrl(null);
    router.refresh();
  }

  const fmt = (d: Date | null) => (d ? new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : null);

  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="order-approval-panel">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Menu Approval</h2>
          <p className="text-xs text-muted-foreground">
            {status === null
              ? "This order hasn't been sent to the customer for approval yet."
              : `Version ${approval?.currentVersion ?? 1}${approval && approval.versionCount === 0 ? " (not sent yet)" : ""}`}
          </p>
        </div>
        {status && <Badge variant={MENU_SELECTION_STATUS_TONE[status]}>{MENU_SELECTION_STATUS_LABEL[status]}</Badge>}
      </div>

      {withCustomer && liveUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <code className="max-w-full truncate rounded bg-muted px-2 py-1 text-xs">{liveUrl}</code>
          <CopyButton value={liveUrl} label="Copy link" size="md" />
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canSend && (
          <Button type="button" size="md" disabled={pending !== null} onClick={handleSend}>
            <Send data-icon="inline-start" />
            {pending === "send" ? "Sending…" : approval && approval.versionCount > 0 ? "Send Updated Menu for Approval" : "Send Menu for Approval"}
          </Button>
        )}
        {canManage && withCustomer && (
          <Button type="button" size="md" variant="outline" disabled={pending !== null} onClick={handleRecall}>
            <Undo2 data-icon="inline-start" />
            {pending === "recall" ? "Recalling…" : "Recall to Edit"}
          </Button>
        )}
        {approval && approval.versions.length > 0 && (
          <Button type="button" size="md" variant="outline" onClick={() => setHistoryOpen(true)}>
            <History data-icon="inline-start" />
            Version history
          </Button>
        )}
        {canManage && approval && (
          <Button size="md" variant="outline" render={<Link href={`/menu-approvals/${approval.menuSelectionId}`} />} nativeButton={false}>
            Open in Menu Approvals
          </Button>
        )}
      </div>

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
