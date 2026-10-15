"use client";

import { ShoppingBasket } from "lucide-react";
import { StatusPanel, type StatusHistoryEntry } from "@/app/(app)/orders/_components/status-panel";
import {
  MENU_SELECTION_STATUS_HINT,
  MENU_SELECTION_STATUS_LABEL,
  MENU_SELECTION_STATUS_ORDER,
  MENU_SELECTION_STATUS_TONE,
} from "@/modules/orders/order-status";
import type { MenuSelectionStatus } from "@/generated/prisma/enums";
import type { ActionResult } from "./types";

/** "Menu Status": the status, what it means, the hand-made change (reason required) and the status history. The page's own Order status card is separate. */
export function ApprovalStatusCard({
  status,
  statusLabel,
  currentVersion,
  orderCompleted,
  canChange = true,
  history,
  onChange,
}: {
  status: MenuSelectionStatus;
  statusLabel: string;
  currentVersion: number;
  /** The order is completed: closed, so the status can't be changed by hand. */
  orderCompleted: boolean;
  /** The viewer may change the status by hand (they can act on the approval). */
  canChange?: boolean;
  history: StatusHistoryEntry[];
  onChange: (value: string, reason: string) => Promise<ActionResult>;
}) {
  return (
    <StatusPanel
      idPrefix="menu-status"
      title="Menu Status"
      icon={ShoppingBasket}
      currentLabel={statusLabel}
      currentTone={MENU_SELECTION_STATUS_TONE[status]}
      hint={MENU_SELECTION_STATUS_HINT[status]}
      extra={`Version ${currentVersion}`}
      options={MENU_SELECTION_STATUS_ORDER.map((value) => ({ value, label: MENU_SELECTION_STATUS_LABEL[value] }))}
      currentValue={status}
      canChange={!orderCompleted && canChange}
      onChange={onChange}
      history={history}
    />
  );
}
