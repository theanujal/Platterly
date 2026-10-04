import type { Metadata } from "next";
import Link from "next/link";
import { User, CalendarDays, MapPin } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { listInvoices } from "@/modules/invoices/invoice";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { invoiceDisplayStatus } from "@/modules/invoices/invoice-status";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { InvoiceStatusBadge, InvoiceTypeBadge } from "./_components/invoice-badges";
import { cn } from "cn";

export const metadata: Metadata = {
  title: "Invoices — Platterly",
  robots: { index: false, follow: false },
};

const FILTERS = [
  { label: "All", value: undefined },
  { label: "Invoices", value: "INVOICE" },
  { label: "Receipts", value: "RECEIPT" },
] as const;

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { organizationId, session } = await requireActiveOrganization();
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  await requirePermission({ invoices: ["view"] }, organizationId);
  const { type } = await searchParams;
  const activeType = type === "INVOICE" || type === "RECEIPT" ? type : undefined;
  const invoices = await listInvoices(organizationId, { type: activeType, locationId });

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Newest First", key: "newest", direction: "desc" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
    { value: "amount-high", label: "Amount (High–Low)", key: "amount", direction: "desc" },
  ];

  const entries: CatalogEntry[] = invoices.map((invoice) => {
    const total = Number(invoice.total);
    const status = invoiceDisplayStatus(invoice.status, invoice.dueDate);
    const pendingAmount = Math.max(total - invoice.paid, 0);
    const sub =
      invoice.type === "RECEIPT" ? <span className="text-xs text-success">Payment received</span> : invoice.paid > 0 ? <span className="text-xs text-info">{inr(invoice.paid)} paid</span> : <span className="text-xs text-destructive">{inr(pendingAmount)} pending</span>;
    const venue = invoice.order.venue;
    return {
      id: invoice.id,
      href: `/invoices/${invoice.id}`,
      searchText: `${invoice.number} ${invoice.customerName} ${invoice.order.orderNumber ?? ""}`,
      sortValues: { customer: invoice.customerName, amount: total, newest: invoice.createdAt.getTime() },
      card: (
        <div className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold text-primary">{invoice.number}</span>
            <InvoiceStatusBadge status={status} />
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate text-base font-semibold">{invoice.customerName}</span>
              {venue && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{venue}</span>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <InvoiceTypeBadge type={invoice.type} />
            {invoice.order.orderNumber && <span className="text-xs text-muted-foreground">{invoice.order.orderNumber}</span>}
          </div>
          <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Amount</span>
              <span className="text-xl font-bold">{inr(total)}</span>
            </div>
            {sub}
          </div>
        </div>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3 font-semibold text-primary">{invoice.number}</TableCell>
          <TableCell className="px-3 py-3">
            <InvoiceTypeBadge type={invoice.type} />
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <User className="size-5" />
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="max-w-44 truncate font-semibold">{invoice.customerName}</span>
                {venue && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="size-3.5 shrink-0" />
                    <span className="max-w-44 truncate">{venue}</span>
                  </span>
                )}
              </div>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{invoice.order.orderNumber ?? "—"}</TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold">{inr(total)}</span>
              {sub}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex items-center gap-2 text-sm">
              <CalendarDays className="size-5 shrink-0 text-muted-foreground" />
              {invoice.type === "RECEIPT" ? "—" : invoice.dueDate ? longDate(invoice.dueDate) : "On receipt"}
            </div>
          </TableCell>
          <TableCell className="px-3 py-3">
            <InvoiceStatusBadge status={status} />
          </TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Invoices" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <p className="text-sm text-muted-foreground">Invoices and receipts for your orders. Create an invoice from an order, then record or collect the payment.</p>
      </div>
      <Separator />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by type">
        {FILTERS.map((filter) => (
          <Link
            key={filter.label}
            href={filter.value ? `/invoices?type=${filter.value}` : "/invoices"}
            className={cn("flex h-9 items-center rounded-lg border px-3 text-sm font-medium", activeType === filter.value ? "border-primary bg-accent text-primary" : "border-border bg-card hover:bg-muted")}
          >
            {filter.label}
          </Link>
        ))}
      </div>
      <CatalogBrowser
        entries={entries}
        columns={["Number", "Type", "Customer", "Order", "Amount", "Due", "Status"]}
        searchPlaceholder="Search by number, customer or order…"
        emptyLabel="No invoices yet. Open an order and choose Create Invoice."
        sortOptions={sortOptions}
        richList
        defaultView="list"
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]"
        pageSize={16}
      />
    </div>
  );
}
