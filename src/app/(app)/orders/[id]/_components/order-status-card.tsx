"use client";

import { ReceiptText } from "lucide-react";
import { ORDER_STATUS_LABEL, ORDER_STATUS_ORDER, ORDER_STATUS_TONE } from "@/modules/orders/order-status";
import { StatusPanel, type StatusHistoryEntry } from "../../_components/status-panel";
import { changeOrderStatusAction } from "../../actions";
import type { OrderStatus } from "@/generated/prisma/enums";

/** The order's status in the sidebar, with the manual change (reason required) and its history (AJ, 2026-09-30). */
export function OrderStatusCard({ orderId, status, hint, history, canChange = true }: { orderId: string; status: OrderStatus; hint: string; history: StatusHistoryEntry[]; /** Changing it by hand needs `orders: edit`; the restricted approval view shows the history only. */ canChange?: boolean }) {
  return (
    <StatusPanel
      idPrefix="order-status"
      requireEdit
      title="Order Status"
      icon={ReceiptText}
      currentLabel={ORDER_STATUS_LABEL[status]}
      currentTone={ORDER_STATUS_TONE[status]}
      hint={hint}
      options={ORDER_STATUS_ORDER.map((value) => ({ value, label: ORDER_STATUS_LABEL[value] }))}
      currentValue={status}
      canChange={canChange && status !== "COMPLETED"}
      onChange={(value, reason) => changeOrderStatusAction(orderId, value as OrderStatus, reason)}
      history={history}
    />
  );
}
