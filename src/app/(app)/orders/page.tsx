import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Plus } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listOrders } from "@/modules/orders/order";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OrdersFilterBar } from "./_components/orders-filter-bar";
import type { OrderStatus, OrderKind } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Orders — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<OrderStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  CONFIRMED: "default",
  IN_PREPARATION: "default",
  READY: "outline",
  COMPLETED: "outline",
  CANCELLED: "destructive",
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  IN_PREPARATION: "In Preparation",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const ORDER_KIND_LABEL: Record<OrderKind, string> = {
  SINGLE: "Single Order",
  MULTI: "Multi Order",
};

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

interface OrdersPageProps {
  searchParams: Promise<{ search?: string; status?: string; orderKind?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  const { search, status, orderKind } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as OrderStatus) : undefined;
  const validOrderKind = orderKind && orderKind in ORDER_KIND_LABEL ? (orderKind as OrderKind) : undefined;

  const orders = await listOrders(organizationId, { search, status: validStatus, orderKind: validOrderKind });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">The commercial record of every catering sale — pricing, participants, and what&apos;s included.</p>
        </div>
        <Button size="sm" render={<Link href="/orders/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Create Order
        </Button>
      </div>

      <OrdersFilterBar />

      {orders.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-semibold">{order.orderNumber ?? "—"}</span>
                      <span className="flex items-center gap-1.5 font-medium">
                        <ShoppingCart className="size-4 text-muted-foreground" />
                        {order.customer.name}
                      </span>
                    </div>
                    <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {order.eventStartDate.toDateString() === order.eventEndDate.toDateString()
                      ? order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
                      : `${order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${order.eventEndDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="w-fit">
                      {ORDER_KIND_LABEL[order.orderKind]}
                    </Badge>
                    {order.eventType && (
                      <Badge variant="outline" className="w-fit">
                        {order.eventType.name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-semibold">{formatCurrency(Number(order.total))}</span>
                    <span className="text-xs text-muted-foreground">
                      {order.paymentStatus === "PAID" ? "Paid" : order.paymentStatus === "PARTIALLY_PAID" ? "Partially Paid" : "Unpaid"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
