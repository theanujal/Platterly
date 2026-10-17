import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission, hasPermission, sensitiveAccess } from "@/lib/auth/require-session";
import { getTenantTimeZone } from "@/lib/settings/timezone";
import { listOrders } from "@/modules/orders/order";
import { parseApprovalFilter, parseOrdersView } from "@/modules/orders/approval-list";
import { listEventTypes } from "@/modules/events/event-type";
import { dayKeyInZone, parseOptionalRange } from "@/lib/time/date-range";
import { DashboardRangePicker } from "../dashboard/_components/dashboard-range-picker";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import {
  CatalogBrowser,
  type CatalogEntry,
  CATALOG_ADD_TILE_CLASSNAME,
  CatalogAddTileContent,
} from "@/components/catalog/catalog-browser";
import { OrdersFilterBar } from "./_components/orders-filter-bar";
import { OrderCard } from "./_components/order-card";
import { OrderListCells } from "./_components/order-list-row";
import { ORDER_KIND_LABEL, STATUS_LABEL } from "./_components/order-display";
import type { OrderStatus, OrderKind } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Orders — Caterly",
  robots: { index: false, follow: false },
};

interface OrdersPageProps {
  searchParams: Promise<{ status?: string; orderKind?: string; eventType?: string; approval?: string; view?: string; from?: string; to?: string }>;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);
  const activeLocation = await getActiveLocation(organizationId, session.user.id);
  const { status, orderKind, eventType, approval, view, from, to } = await searchParams;
  const range = parseOptionalRange(from, to);
  const timeZone = await getTenantTimeZone(organizationId);
  const ordersView = parseOrdersView(view);
  const approvalFilter = parseApprovalFilter(approval);
  const validStatus = status && status in STATUS_LABEL ? (status as OrderStatus) : undefined;
  const validOrderKind = orderKind && orderKind in ORDER_KIND_LABEL ? (orderKind as OrderKind) : undefined;

  // Resolved before listOrders so an unknown/foreign id in the URL is ignored rather than filtering to nothing.
  const eventTypes = await listEventTypes(organizationId);
  const validEventTypeId = eventTypes.find((t) => t.id === eventType)?.id;

  const [orders, canEdit, canDelete, canCreate, prices] = await Promise.all([
    // The default list shows every order, past events included (AJ, 2026-10-16; it hid past-event orders from 2026-09-30).
    // The Past view narrows to past-event orders whose menu approval is still outstanding (Decision 9).
    // Overdue payments live under Finance now (AJ, 2026-10-12): it is the finance team's job to collect them.
    listOrders(organizationId, {
      locationId: activeLocation.locationId,
      when: ordersView === "past" ? "past" : undefined,
      outstandingApproval: ordersView === "past",
      status: validStatus,
      orderKind: validOrderKind,
      eventTypeId: validEventTypeId,
      approval: approvalFilter,
      eventFrom: range?.from,
      eventTo: range?.to,
    }),
    hasPermission({ orders: ["edit"] }, organizationId),
    hasPermission({ orders: ["delete"] }, organizationId),
    hasPermission({ orders: ["create"] }, organizationId),
    sensitiveAccess(organizationId),
  ]);
  // Amounts and payment status are sensitive data, separate from opening Orders (AJ, 2026-10-17).
  const showMoney = prices.orderPrices;
  const showPayment = prices.paymentDetails;
  // One timestamp for every card, so their "Starts in" countdowns agree.
  const now = new Date();

  const entries: CatalogEntry[] = orders.map((order) => {
    return {
      id: order.id,
      href: `/orders/${order.id}`,
      cardOwnsLink: true,
      searchText: `${order.customer.name} ${order.customer.phone} ${order.orderNumber ?? ""}`,
      sortValues: {
        customer: order.customer.name,
        ...(showMoney ? { total: Number(order.total) } : {}),
        newest: order.createdAt.getTime(),
        eventDate: order.eventStartDate.getTime(),
      },
      card: <OrderCard key={`card-${order.id}`} order={order} now={now} timeZone={timeZone} canEdit={canEdit} canDelete={canDelete} showMoney={showMoney} showPayment={showPayment} />,
      listRow: <OrderListCells key={`row-${order.id}`} order={order} now={now} timeZone={timeZone} showMoney={showMoney} showPayment={showPayment} />,
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
        <div className="flex flex-wrap items-center justify-end gap-3">
          {/* Filters by the event's dates; with no range every order is listed (AJ, 2026-10-16). */}
          <DashboardRangePicker range={range} todayIso={dayKeyInZone(now, timeZone)} emptyLabel="All Dates" testId="orders-range" />
          {canCreate && (
            <Button render={<Link href="/orders/new" />} nativeButton={false}>
              <Plus className="size-4" />
              Create Order
            </Button>
          )}
        </div>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={
          canCreate ? (
            <Link key="orders-add-tile" href="/orders/new" className={CATALOG_ADD_TILE_CLASSNAME}>
              <CatalogAddTileContent label="Create Order" description="Start a new catering sale" />
            </Link>
          ) : undefined
        }
        columns={["Order #", "Order Type", "Customer", "Event", "Guests", ...(showMoney ? ["Amount"] : []), "Status", "Menu Approval", "Open"]}
        richList
        defaultView="list"
        searchPlaceholder="Search orders by customer, phone, or order #…"
        emptyLabel={ordersView === "past" ? "No past orders with menu approval work outstanding." : "No orders yet."}
        filters={<OrdersFilterBar key="orders-filters" eventTypes={eventTypes.map((t) => ({ id: t.id, name: t.name }))} />}
        // The design system's Order card (§09) switches from its stacked layout to
        // the wide one (status beside the order number, three stat cells, amount
        // beside payment) once its own inner width reaches 24rem — so every card
        // is given at least 26.5rem (24rem + p-5 padding). That's 2 columns at
        // 1440px, 3 on wider screens; `min(…, 100%)` keeps a phone to one column.
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(26.5rem,100%),1fr))]"
      />
    </div>
  );
}
