import Link from "next/link";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RevenueTrendChart } from "./revenue-trend-chart";
import type { OrderStatus, OrderPaymentStatus } from "@/generated/prisma/enums";

// Same status → badge-variant/label mapping as the Orders list page
// (src/app/(app)/orders/page.tsx) — kept in sync deliberately so a status
// reads identically wherever it appears.
const STATUS_VARIANT: Record<OrderStatus, "neutral" | "info" | "success" | "danger"> = {
  DRAFT: "neutral",
  CONFIRMED: "info",
  IN_PREPARATION: "info",
  READY: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface OrderRow {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  total: number;
  eventStartDate: Date;
  customerName: string;
}

interface RevenueTrendPoint {
  date: string;
  totalValue: number;
  completedValue: number;
  pendingValue: number;
}

interface OrdersActivityCardProps {
  revenueTrend: RevenueTrendPoint[];
  recentOrders: OrderRow[];
  totalOrders: number;
}

// The dashboard's dominant module — a real revenue trend (order value per
// day, last 30 days) plus the most recent orders, each one a direct link
// into that order. Status breakdown lives in the KPI grid above this card,
// so it isn't repeated here.
export function OrdersActivityCard({ revenueTrend, recentOrders, totalOrders }: OrdersActivityCardProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShoppingCart className="size-4" />
          </div>
          <CardTitle>Orders</CardTitle>
        </div>
        <CardAction>
          <Link href="/orders" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            View all
            <ArrowRight className="size-3.5" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {totalOrders === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShoppingCart className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">No orders yet</p>
              <p className="text-xs text-muted-foreground">Orders you create will show up here.</p>
            </div>
            <Button size="md" render={<Link href="/orders/new" />} nativeButton={false}>
              Create an order
            </Button>
          </div>
        ) : (
          <>
            <RevenueTrendChart data={revenueTrend} />
            <div className="flex flex-col divide-y divide-border">
              {recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors first:pt-0 last:pb-0 hover:bg-muted/40"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{order.customerName}</span>
                    <span className="text-xs text-muted-foreground">
                      {order.orderNumber ?? "—"} · {order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    <span className="text-sm font-semibold">{formatCurrency(order.total)}</span>
                    <Badge variant={STATUS_VARIANT[order.status]} className="w-fit">
                      {STATUS_LABEL[order.status]}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
