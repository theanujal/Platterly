import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus, Circle, Send, Eye, TriangleAlert, Check, X, CalendarX } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listQuotations } from "@/modules/quotations/quotation";
import { getEventTypeIcon } from "@/lib/event-type-icons";
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
import { QuotationsFilterBar } from "./_components/quotations-filter-bar";
import type { QuotationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Quotations — Platterly",
  robots: { index: false, follow: false },
};

// Shared neutral/info/warning/success/danger legend (AJ, 2026-09-19).
const STATUS_VARIANT: Record<QuotationStatus, NonNullable<VariantProps<typeof badgeVariants>["variant"]>> = {
  DRAFT: "neutral",
  SENT: "info",
  VIEWED: "info",
  CHANGES_REQUESTED: "warning",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

const STATUS_ICON: Record<QuotationStatus, LucideIcon> = {
  DRAFT: Circle,
  SENT: Send,
  VIEWED: Eye,
  CHANGES_REQUESTED: TriangleAlert,
  ACCEPTED: Check,
  REJECTED: X,
  EXPIRED: CalendarX,
};

const STATUS_LABEL: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  VIEWED: "Viewed",
  CHANGES_REQUESTED: "Changes Requested",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
};

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

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
    { value: "total-high", label: "Total (High–Low)", key: "total", direction: "desc" },
    { value: "total-low", label: "Total (Low–High)", key: "total" },
  ];

  const entries: CatalogEntry[] = quotations.map((quotation) => {
    const StatusIcon = STATUS_ICON[quotation.status];
    const EventTypeIcon = quotation.eventType ? getEventTypeIcon(quotation.eventType.icon) : null;
    return {
    id: quotation.id,
    href: `/quotations/${quotation.id}`,
    searchText: `${quotation.customer.name} ${quotation.customer.phone}`,
    sortValues: { customer: quotation.customer.name, total: Number(quotation.total), newest: quotation.createdAt.getTime() },
    card: (
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <span className="flex items-center gap-1.5 font-medium">
            <FileText className="size-4 text-muted-foreground" />
            {quotation.customer.name}
          </span>
          <Badge variant={STATUS_VARIANT[quotation.status]}>
            <StatusIcon data-icon="inline-start" />
            {STATUS_LABEL[quotation.status]}
          </Badge>
        </div>
        {quotation.eventType && EventTypeIcon && (
          <Badge variant="outline" className="w-fit">
            <EventTypeIcon data-icon="inline-start" />
            {quotation.eventType.name}
          </Badge>
        )}
        <span className="text-sm font-semibold">{formatCurrency(Number(quotation.total))}</span>
        {quotation.validUntil && (
          <span className="text-xs text-muted-foreground">Valid until {formatDate(quotation.validUntil)}</span>
        )}
      </div>
    ),
    listRow: (
      <>
        <TableCell className="font-medium">{quotation.customer.name}</TableCell>
        <TableCell className="text-muted-foreground">{quotation.eventType?.name ?? "—"}</TableCell>
        <TableCell>{formatCurrency(Number(quotation.total))}</TableCell>
        <TableCell className="text-muted-foreground">{quotation.validUntil ? formatDate(quotation.validUntil) : "—"}</TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[quotation.status]}>
            <StatusIcon data-icon="inline-start" />
            {STATUS_LABEL[quotation.status]}
          </Badge>
        </TableCell>
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
        columns={["Customer", "Event Type", "Total", "Valid Until", "Status"]}
        searchPlaceholder="Search quotations by customer or phone…"
        emptyLabel="No quotations yet."
        filters={<QuotationsFilterBar />}
        sortOptions={sortOptions}
        pageSize={16}
      />
    </div>
  );
}
