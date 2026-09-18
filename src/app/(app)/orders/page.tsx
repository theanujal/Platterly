import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingCart, Plus, Circle, Clock, Package, Check, X, Receipt, Layers } from "lucide-react";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listOrders } from "@/modules/orders/order";
import { Badge, type badgeVariants } from "@/components/ui/badge";
import type { VariantProps } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";
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

// Shared neutral/info/warning/success/danger legend (AJ, 2026-09-19).
const STATUS_VARIANT: Record<OrderStatus, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
  DRAFT: "neutral",
  CONFIRMED: "info",
  IN_PREPARATION: "info",
  READY: "success",
  COMPLETED: "success",
  CANCELLED: "danger",
};

const STATUS_ICON: Record<OrderStatus, LucideIcon> = {
  DRAFT: Circle,
  CONFIRMED: Clock,
  IN_PREPARATION: Clock,
  READY: Package,
  COMPLETED: Check,
  CANCELLED: X,
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

// Legend for Single vs. Multi Order (AJ, 2026-09-19) — both used to render
// the same "secondary" gray badge with no way to tell them apart at a glance.
const ORDER_KIND_VARIANT: Record<OrderKind, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
  SINGLE: "neutral",
  MULTI: "info",
};

const ORDER_KIND_ICON: Record<OrderKind, LucideIcon> = {
  SINGLE: Receipt,
  MULTI: Layers,
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

  const entries: CatalogEntry[] = orders.map((order) => {
    const StatusIcon = STATUS_ICON[order.status];
    const OrderKindIcon = ORDER_KIND_ICON[order.orderKind];
    const EventTypeIcon = order.eventType ? getEventTypeIcon(order.eventType.icon) : null;
    return {
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
          <Badge variant={STATUS_VARIANT[order.status]}>
            <StatusIcon data-icon="inline-start" />
            {STATUS_LABEL[order.status]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {order.eventStartDate.toDateString() === order.eventEndDate.toDateString()
            ? formatDate(order.eventStartDate)
            : `${order.eventStartDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${formatDate(order.eventEndDate)}`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={ORDER_KIND_VARIANT[order.orderKind]} className="w-fit">
            <OrderKindIcon data-icon="inline-start" />
            {ORDER_KIND_LABEL[order.orderKind]}
          </Badge>
          {order.eventType && EventTypeIcon && (
            <Badge variant="outline" className="w-fit">
              <EventTypeIcon data-icon="inline-start" />
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
          <Badge variant={STATUS_VARIANT[order.status]}>
            <StatusIcon data-icon="inline-start" />
            {STATUS_LABEL[order.status]}
          </Badge>
        </TableCell>
      </>
    ),
    };
  });

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
