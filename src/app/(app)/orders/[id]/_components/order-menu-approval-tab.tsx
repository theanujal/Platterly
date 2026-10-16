"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MENU_SELECTION_STATUS_HINT, MENU_SELECTION_STATUS_TONE } from "@/modules/orders/order-status";
import { ApprovalActionBar } from "@/modules/menu-approvals/_components/review/approval-action-bar";
import type { EventOverviewData } from "@/modules/menu-approvals/_components/review/approval-event-overview-card";
import { ApprovalReviewBody } from "@/modules/menu-approvals/_components/review/approval-review-body";
import { useApprovalController } from "@/modules/menu-approvals/_components/review/use-approval-controller";
import type { MenuApprovalReviewProps } from "@/modules/menu-approvals/_components/review/types";
import { reviewActions } from "../../../menu-approvals/_components/review-actions";
import { startMenuApprovalAction } from "../../../menu-approvals/actions";

/** What the "not started" state needs: no approval exists for this order yet. */
export interface NotStartedInfo {
  orderId: string;
  /** The viewer may start it (`menus: approve`) and the order can have one (an Event Type, not Completed or Cancelled). */
  canStart: boolean;
  /** Why it can't start, in words, when `canStart` is false. */
  reason: string | null;
}

/**
 * The order's Menu Approval tab (Menu Approvals + Orders merge, Phase 2): the review itself (the old `/menu-approvals/[id]` page redirects here), built from the shared
 * components and the server actions, with the order page around it. The viewer's capabilities decide which controls show; the server
 * checks every action again. With no approval yet it offers to start one.
 */
export function OrderMenuApprovalTab({ data, notStarted, eventOverview }: { data: MenuApprovalReviewProps | null; notStarted: NotStartedInfo; eventOverview?: EventOverviewData }) {
  if (!data) return <NotStarted info={notStarted} />;
  return <Review data={data} eventOverview={eventOverview} />;
}


function Review({ data, eventOverview }: { data: MenuApprovalReviewProps; eventOverview?: EventOverviewData }) {
  const router = useRouter();
  const pathname = usePathname();
  const c = useApprovalController({
    data,
    actions: reviewActions,
    // The tab stays open while a version is viewed (Phase 4's redirects use the same address).
    navigation: {
      openVersion: (versionNumber) => router.push(`${pathname}?tab=approval&version=${versionNumber}`),
      backToCurrent: () => router.push(`${pathname}?tab=approval`),
    },
  });
  return (
    <>
      <Card className="gap-3 px-5 [--card-spacing:--spacing(5)]" data-testid="approval-tab-header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-semibold">Menu Approval</h2>
              <Badge variant={MENU_SELECTION_STATUS_TONE[data.status]} data-testid="approval-tab-status">
                {data.statusLabel}
              </Badge>
              <span className="text-sm text-muted-foreground">Version {data.currentVersion}</span>
              {!data.capabilities.canAct && <Badge variant="neutral">View only</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{MENU_SELECTION_STATUS_HINT[data.status]}</p>
          </div>
          {data.capabilities.canAct && (
            <ApprovalActionBar
              status={data.status}
              hasSentVersion={data.versions.length > 0}
              viewingVersion={c.shownVersion !== null}
              editable={c.editable}
              withCustomer={c.withCustomer}
              pending={c.pending}
              dirty={c.dirty}
              onSave={c.handleSave}
              onSend={c.handleSend}
              onRecall={c.handleRecall}
              onApprove={c.handleApprove}
            />
          )}
        </div>
      </Card>
      <ApprovalReviewBody data={data} c={c} actions={reviewActions} cardsInSidebar eventOverview={eventOverview} onViewDetails={eventOverview ? () => router.push(`${pathname}?tab=details`) : undefined} />
    </>
  );
}

function NotStarted({ info }: { info: NotStartedInfo }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setError(null);
    const result = await startMenuApprovalAction(info.orderId);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  return (
    <Card className="gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="approval-not-started">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <ClipboardCheck className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Menu approval not started</h2>
          <p className="text-sm text-muted-foreground">Nothing has been sent to the customer. Starting it opens the menu for review; it is not sent until you send it.</p>
        </div>
        <Badge variant="neutral">Not started</Badge>
      </div>
      {info.reason && <p className="text-sm text-muted-foreground">{info.reason}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {info.canStart && (
        <div>
          <Button type="button" disabled={pending} onClick={start}>
            {pending ? "Starting…" : "Start menu approval"}
          </Button>
        </div>
      )}
    </Card>
  );
}
