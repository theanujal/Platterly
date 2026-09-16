import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Plus } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listOrders } from "@/modules/orders/order";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import {
  CatalogBrowser,
  type CatalogEntry,
  type CatalogSortOption,
  CATALOG_ADD_TILE_CLASSNAME,
  CatalogAddTileContent,
} from "@/components/catalog/catalog-browser";
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

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface OrdersPageProps {
  searchParams: Promise<{ status?: string; orderKind?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  const { status, orderKind } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as OrderStatus) : undefined;
  const validOrderKind = orderKind && orderKind in ORDER_KIND_LABEL ? (orderKind as OrderKind) : undefined;

  const orders = await listOrders(organizationId, { status: validStatus, orderKind: validOrderKind });

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
    { value: "total-high", label: "Total (High–Low)", key: "total", direction: "desc" },
    { value: "total-low", label: "Total (Low–High)", key: "total" },
    { value: "event-date", label: "Event Date", key: "eventDate" },
  ];

  const entries: CatalogEntry[] = orders.map((order) => ({
    id: order.id,
    href: `/orders/${order.id}`,
    searchText: `${order.customer.name} ${order.customer.phone} ${order.orderNumber ?? ""}`,
    sortValues: {
      customer: order.customer.name,
      total: Number(order.total),
      newest: order.eventStartDate.getTime(),
      eventDate: order.eventStartDate.getTime(),
    },
    card: (
      <div className="flex flex-col gap-2 p-4">
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
            ? formatDate(order.eventStartDate)
            : `${order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${formatDate(order.eventEndDate)}`}
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
      </div>
    ),
    listRow: (
      <>
        <TableCell className="font-medium">{order.orderNumber ?? "—"}</TableCell>
        <TableCell>{order.customer.name}</TableCell>
        <TableCell className="text-muted-foreground">{formatDate(order.eventStartDate)}</TableCell>
        <TableCell>{formatCurrency(Number(order.total))}</TableCell>
        <TableCell className="text-muted-foreground">
          {order.paymentStatus === "PAID" ? "Paid" : order.paymentStatus === "PARTIALLY_PAID" ? "Partially Paid" : "Unpaid"}
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[order.status]}>{STATUS_LABEL[order.status]}</Badge>
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Orders" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-muted-foreground">The commercial record of every catering sale — pricing, participants, and what&apos;s included.</p>
        </div>
        <Button render={<Link href="/orders/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Create Order
        </Button>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={
          <Link href="/orders/new" className={CATALOG_ADD_TILE_CLASSNAME}>
            <CatalogAddTileContent label="Create Order" description="Start a new catering sale" />
          </Link>
        }
        columns={["Order #", "Customer", "Event Date", "Total", "Payment", "Status"]}
        searchPlaceholder="Search orders by customer, phone, or order #…"
        emptyLabel="No orders yet."
        filters={<OrdersFilterBar />}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
