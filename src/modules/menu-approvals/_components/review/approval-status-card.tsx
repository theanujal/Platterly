"use client";

import { ShoppingBasket } from "lucide-react";
import { StatusPanel, type StatusHistoryEntry } from "@/app/(app)/orders/_components/status-panel";
import {
  MENU_SELECTION_STATUS_LABEL,
  MENU_SELECTION_STATUS_ORDER,
  MENU_SELECTION_STATUS_TONE,
} from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "./approval-format";
import { ApprovalVersionRows } from "./approval-history-card";
import type { ActionResult, VersionView } from "./types";

/**
 * "Approval Status": the status, the version, whether it was sent to the customer and who last changed it. "View approval history" opens a drawer with
 * the full status timeline, the hand-made change (reason required) and every menu version. The page's own Order status card is separate.
 */
export function ApprovalStatusCard({
  status,
  statusLabel,
  currentVersion,
  orderCompleted,
  canChange = true,
  history,
  versions,
  onOpenVersion,
  onChange,
  showPrices = true,
}: {
  showPrices?: boolean;
  status: MenuSelectionStatus;
  statusLabel: string;
  currentVersion: number;
  /** The order is completed: closed, so the status can't be changed by hand. */
  orderCompleted: boolean;
  /** The viewer may change the status by hand (they can act on the approval). */
  canChange?: boolean;
  history: StatusHistoryEntry[];
  /** Newest first. */
  versions: VersionView[];
  onOpenVersion: (versionNumber: number) => void;
  onChange: (value: string, reason: string) => Promise<ActionResult>;
}) {
  const lastSent = versions[0];
  return (
    <StatusPanel
      compact
      idPrefix="menu-status"
      title="Menu Approval Status"
      historyName="approval"
      icon={ShoppingBasket}
      currentLabel={statusLabel}
      currentTone={MENU_SELECTION_STATUS_TONE[status]}
      description={`Version ${currentVersion} · ${lastSent ? `Sent to customer ${formatDateTime(lastSent.sentAt ?? lastSent.createdAt)}` : "Not sent to customer yet."}`}
      options={MENU_SELECTION_STATUS_ORDER.map((value) => ({ value, label: MENU_SELECTION_STATUS_LABEL[value] }))}
      currentValue={status}
      canChange={!orderCompleted && canChange}
      onChange={onChange}
      history={history}
      historyExtra={(close) => (
        <ApprovalVersionRows versions={versions} currentVersion={currentVersion} status={status} statusLabel={statusLabel} onOpenVersion={onOpenVersion} onOpened={close} showPrices={showPrices} />
      )}
    />
  );
}
