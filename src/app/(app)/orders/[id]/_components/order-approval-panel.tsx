"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { MENU_SELECTION_STATUS_LABEL, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import { sendMenuForApprovalAction, recallMenuAction } from "../../../menu-approvals/actions";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";

interface OrderApprovalPanelProps {
  orderId: string;
  /** Null until the order has been sent for approval once. */
  approval: { menuSelectionId: string; status: MenuSelectionStatus; currentVersion: number; versionCount: number; approvalUrl: string | null } | null;
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

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-4" data-testid="order-approval-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">Menu Approval</h2>
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
        {canManage && approval && (
          <Button size="md" variant="outline" render={<Link href={`/menu-approvals/${approval.menuSelectionId}`} />} nativeButton={false}>
            Open in Menu Approvals
          </Button>
        )}
      </div>
    </section>
  );
}
