import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Plus } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listQuotations } from "@/modules/quotations/quotation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption, CATALOG_ADD_TILE_CLASSNAME } from "@/components/catalog/catalog-browser";
import { QuotationsFilterBar } from "./_components/quotations-filter-bar";
import type { QuotationStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = {
  title: "Quotations — Platterly",
  robots: { index: false, follow: false },
};

const STATUS_VARIANT: Record<QuotationStatus, "default" | "secondary" | "outline" | "destructive"> = {
  DRAFT: "secondary",
  SENT: "outline",
  VIEWED: "outline",
  CHANGES_REQUESTED: "destructive",
  ACCEPTED: "default",
  REJECTED: "destructive",
  EXPIRED: "secondary",
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

  const entries: CatalogEntry[] = quotations.map((quotation) => ({
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
          <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
        </div>
        {quotation.eventType && (
          <Badge variant="outline" className="w-fit">
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
          <Badge variant={STATUS_VARIANT[quotation.status]}>{STATUS_LABEL[quotation.status]}</Badge>
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Quotations</h1>
          <p className="text-sm text-muted-foreground">Send a priced proposal for a customer to approve digitally, before it becomes an Order.</p>
        </div>
        <Button size="sm" render={<Link href="/quotations/new" />} nativeButton={false}>
          <Plus className="size-4" />
          Create Quotation
        </Button>
      </div>

      <CatalogBrowser
        entries={entries}
        addTile={
          <Link href="/quotations/new" className={CATALOG_ADD_TILE_CLASSNAME}>
            <Plus className="size-6" />
            <span className="text-sm font-medium">Create Quotation</span>
          </Link>
        }
        columns={["Customer", "Event Type", "Total", "Valid Until", "Status"]}
        searchPlaceholder="Search quotations by customer or phone…"
        emptyLabel="No quotations yet."
        filters={<QuotationsFilterBar />}
        sortOptions={sortOptions}
        pageSize={9}
      />
    </div>
  );
}
