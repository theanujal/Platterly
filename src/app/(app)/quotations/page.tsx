import { createElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus, User, MapPin, CalendarDays, Clock, type LucideProps } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listQuotations } from "@/modules/quotations/quotation";
import { getEventTypeIcon } from "@/lib/event-type-icons";
import { formatEventWhen } from "@/modules/orders/order-card";
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
import { QuotationsFilterBar } from "./_components/quotations-filter-bar";
import { STATUS_VARIANT, STATUS_ICON, STATUS_LABEL } from "./_components/quotation-display";
import type { QuotationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Quotations — Platterly",
  robots: { index: false, follow: false },
};

// Badge pads its leading edge tighter when it sees this attribute on an icon child (same convention as order-card.tsx).
const INLINE_START_ICON = { "data-icon": "inline-start" } as LucideProps;

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface QuotationsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function QuotationsPage({ searchParams }: QuotationsPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ quotations: ["view"] }, organizationId);
  const { status } = await searchParams;
  const validStatus = status && status in STATUS_LABEL ? (status as QuotationStatus) : undefined;

  const quotations = await listQuotations(organizationId, { status: validStatus });
  const now = new Date();

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
    { value: "total-high", label: "Total (High–Low)", key: "total", direction: "desc" },
    { value: "total-low", label: "Total (Low–High)", key: "total" },
  ];

  // Card/list built to match the Order Card's design language (avatar, divided stat row, footer amount)
  // per AJ's request (2026-09-28) — Quotation's own thinner field set (no guests, no payment/advance,
  // nullable event dates) means the helpers here are Quotation-specific, not reused from order-card.ts.
  const entries: CatalogEntry[] = quotations.map((quotation) => {
    const StatusIcon = STATUS_ICON[quotation.status];
    const EventTypeIcon = quotation.eventType ? getEventTypeIcon(quotation.eventType.icon) : null;
    const eventDateLabel = quotation.eventStartDate ? formatEventWhen(quotation.eventStartDate, quotation.eventEndDate ?? quotation.eventStartDate, now) : "—";
    const validUntilLabel = quotation.validUntil ? formatDate(quotation.validUntil) : "—";
    const statusBadge = (
      <Badge variant={STATUS_VARIANT[quotation.status]}>
        <StatusIcon data-icon="inline-start" />
        {STATUS_LABEL[quotation.status]}
      </Badge>
    );

    return {
      id: quotation.id,
      href: `/quotations/${quotation.id}`,
      searchText: `${quotation.customer.name} ${quotation.customer.phone}`,
      sortValues: { customer: quotation.customer.name, total: Number(quotation.total), newest: quotation.createdAt.getTime() },
      card: (
        <div className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className="truncate text-base font-semibold">{quotation.customer.name}</span>
                {quotation.venue && (
                  <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="truncate">{quotation.venue}</span>
                  </span>
                )}
              </div>
            </div>
            {statusBadge}
          </div>

          {quotation.eventType && EventTypeIcon && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">
                {createElement(EventTypeIcon, INLINE_START_ICON)}
                {quotation.eventType.name}
              </Badge>
            </div>
          )}

          {/* Vertical divider between cells, no border-t above — matches the Order Card's own stat row. */}
          <div className="grid grid-cols-2 items-center gap-x-3 divide-x divide-border">
            <div className="flex min-w-0 items-center gap-2.5 pr-3">
              <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground">Event Date</span>
                <span className="truncate text-sm font-semibold">{eventDateLabel}</span>
              </div>
            </div>
            <div className="flex min-w-0 items-center gap-2.5 pl-3">
              <Clock className="size-5 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-col">
                <span className="text-xs text-muted-foreground">Valid Until</span>
                <span className="truncate text-sm font-semibold">{validUntilLabel}</span>
              </div>
            </div>
          </div>

          <div className="mt-auto flex flex-col gap-0.5 border-t border-border pt-4">
            <span className="text-xs text-muted-foreground">Total Amount</span>
            <span className="text-xl font-bold">{formatCurrency(Number(quotation.total))}</span>
          </div>
        </div>
      ),
      // Rich list — a Customer cell (avatar, name, venue) and an Event cell (date, event type below)
      // merged the same way Orders' own list merges cells, instead of separate Name/Event Type columns.
      listRow: (
        <>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="max-w-44 truncate font-semibold">{quotation.customer.name}</span>
                {quotation.venue && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="max-w-44 truncate">{quotation.venue}</span>
                  </span>
                )}
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium whitespace-nowrap">{eventDateLabel}</span>
                {quotation.eventType && <span className="max-w-40 truncate text-xs text-muted-foreground">{quotation.eventType.name}</span>}
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 font-semibold">{formatCurrency(Number(quotation.total))}</TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{validUntilLabel}</TableCell>
          <TableCell className="px-3 py-3">{statusBadge}</TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Quotations" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Quotations</h1>
          <p className="text-sm text-muted-foreground">Send a priced proposal for a customer to approve digitally, before it becomes an Order.</p>
        </div>
        <Button render={<Link href="/quotations/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Create Quotation
        </Button>
      </div>
      <Separator />

      <CatalogBrowser
        entries={entries}
        addTile={
          <Link href="/quotations/new" className={CATALOG_ADD_TILE_CLASSNAME}>
            <CatalogAddTileContent label="Create Quotation" description="Send a priced proposal to a customer" />
          </Link>
        }
        columns={["Customer", "Event", "Total", "Valid Until", "Status"]}
        searchPlaceholder="Search quotations by customer or phone…"
        emptyLabel="No quotations yet."
        filters={<QuotationsFilterBar />}
        sortOptions={sortOptions}
        richList
        // The card now carries a divided stat row plus a footer amount block (matching the Order
        // Card's own layout) and needs more room than the default grid gives it.
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(22rem,100%),1fr))]"
        pageSize={16}
      />
    </div>
  );
}
