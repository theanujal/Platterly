import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listOrders } from "@/modules/orders/order";
import { Button } from "@/components/ui/button";
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
import { OrderCard } from "./_components/order-card";
import { OrderListCells } from "./_components/order-list-row";
import { ORDER_KIND_LABEL, STATUS_LABEL } from "./_components/order-display";
import type { OrderStatus, OrderKind } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Orders — Platterly",
  robots: { index: false, follow: false },
};

interface OrdersPageProps {
  searchParams: Promise<{ status?: string; orderKind?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  const { status, orderKind } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as OrderStatus) : undefined;
  const validOrderKind = orderKind && orderKind in ORDER_KIND_LABEL ? (orderKind as OrderKind) : undefined;

  const [orders, canEdit, canDelete] = await Promise.all([
    listOrders(organizationId, { status: validStatus, orderKind: validOrderKind }),
    hasPermission({ orders: ["edit"] }, organizationId),
    hasPermission({ orders: ["delete"] }, organizationId),
  ]);
  // One timestamp for every card, so their "Starts in" countdowns agree.
  const now = new Date();

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
    { value: "total-high", label: "Total (High–Low)", key: "total", direction: "desc" },
    { value: "total-low", label: "Total (Low–High)", key: "total" },
    { value: "event-date", label: "Event Date", key: "eventDate" },
  ];

  const entries: CatalogEntry[] = orders.map((order) => {
    return {
      id: order.id,
      href: `/orders/${order.id}`,
      cardOwnsLink: true,
      searchText: `${order.customer.name} ${order.customer.phone} ${order.orderNumber ?? ""}`,
      sortValues: {
        customer: order.customer.name,
        total: Number(order.total),
        newest: order.eventStartDate.getTime(),
        eventDate: order.eventStartDate.getTime(),
      },
      card: <OrderCard order={order} now={now} canEdit={canEdit} canDelete={canDelete} />,
      listRow: <OrderListCells order={order} now={now} />,
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
        columns={["Order #", "Customer", "Event", "Guests", "Total", "Payment", "Status", "Open"]}
        richList
        searchPlaceholder="Search orders by customer, phone, or order #…"
        emptyLabel="No orders yet."
        filters={<OrdersFilterBar />}
        sortOptions={sortOptions}
        pageSize={16}
        // 4 columns from xl (AJ, 2026-09-26) — the catalog default. The card's
        // own @container queries reflow it for the narrower width.
        gridColumnsClassName="grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
      />
    </div>
  );
}
