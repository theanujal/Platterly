import { CalendarDays, Layers, Receipt, Tag, Users, UtensilsCrossed, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import type { MenuApprovalReviewProps } from "@/modules/menu-approvals/_components/review/types";
import type { OrderStatus } from "@/generated/prisma/enums";
import type { StatusHistoryEntry } from "../../_components/status-panel";
import { ApprovalSidebarLayout } from "@/modules/menu-approvals/_components/review/sidebar-slot";
import { OrderMenuApprovalTab, type NotStartedInfo } from "./order-menu-approval-tab";
import { OrderStatusCard } from "./order-status-card";
import { OrderSummaryCard } from "./order-summary-card";

/**
 * The order as a person with `menus: approve` but not `orders: edit` sees it (Menu Approvals + Orders merge, Phase 2, Decision 6): the order's
 * header and summary, its status history, and the Menu Approval tab, nothing else. It is a view of its own, not the order form with
 * the fields switched off, and the page loads only the fields below for it: no customer phone or email, no notes, no pricing editor,
 * payments, expenses, staffing or inventory. There is no order-edit control on it and no order-save action is reachable from it.
 */
export interface ApprovalOnlyOrderData {
  orderId: string;
  orderNumber: string | null;
  status: OrderStatus;
  customerName: string;
  orderKindLabel: string;
  multiOrder: boolean;
  eventTypeName: string | null;
  eventDateText: string;
  startDateText: string;
  venue: string | null;
  mealCount: number;
  guests: { total: number; adults: number; below5: number; from5to10: number };
  kitchenName: string | null;
  showKitchen: boolean;
  createdAt: Date;
  updatedAt: Date;
  statusHint: string;
  statusHistory: StatusHistoryEntry[];
}

export function ApprovalOnlyOrderView({ order, approval, notStarted }: { order: ApprovalOnlyOrderData; approval: MenuApprovalReviewProps | null; notStarted: NotStartedInfo }) {
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8" data-testid="approval-only-order">
      <div className="flex flex-col gap-4">
        <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Menu Approvals", href: "/menu-approvals" }, { label: order.orderNumber ?? "Order" }]} />
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">{order.orderNumber ?? "Order"}</h1>
            <Badge variant={order.multiOrder ? "info" : "neutral"}>
              {order.multiOrder ? <Layers data-icon="inline-start" /> : <Receipt data-icon="inline-start" />}
              {order.orderKindLabel}
            </Badge>
          </div>
          <p className="text-base font-medium">Order for {order.customerName}</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
            {order.eventTypeName && (
              <span className="flex items-center gap-1.5">
                <Tag className="size-4" />
                {order.eventTypeName}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <CalendarDays className="size-4" />
              {order.startDateText}
            </span>
            <span className="flex items-center gap-1.5">
              <UtensilsCrossed className="size-4" />
              {order.mealCount} {order.mealCount === 1 ? "Meal" : "Meals"}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="size-4" />
              {order.guests.total} Guests
            </span>
          </div>
        </div>
      </div>

      <div role="status" className="flex items-start gap-3 rounded-xl border border-info/30 bg-info/10 p-4 text-sm" data-testid="approval-only-banner">
        <Info className="mt-0.5 size-4 shrink-0 text-info" />
        <p>You can review and approve this order&apos;s menu. The rest of the order is view-only for your role.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OrderSummaryCard
          orderNumber={order.orderNumber}
          status={order.status}
          assignedKitchen={order.kitchenName}
          showKitchen={order.showKitchen}
          createdAt={order.createdAt}
          updatedAt={order.updatedAt}
          customer={order.customerName}
          orderType={order.orderKindLabel}
          eventType={order.eventTypeName}
          eventDate={order.eventDateText}
          venue={order.venue}
          guests={order.guests}
        />
        <OrderStatusCard orderId={order.orderId} status={order.status} hint={order.statusHint} history={order.statusHistory} canChange={false} />
      </div>

      <ApprovalSidebarLayout>
        <OrderMenuApprovalTab data={approval} notStarted={notStarted} />
      </ApprovalSidebarLayout>
    </div>
  );
}
