import type { Metadata } from "next";
import Link from "next/link";
import { User, CalendarDays, MapPin, Phone } from "lucide-react";
import { getActiveLocation } from "@/modules/locations/active-location";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listOverdueOrders } from "@/modules/orders/order";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { SectionTabs } from "@/components/app-shell/section-tabs";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { RecordPaymentButton } from "./_components/record-payment-button";

export const metadata: Metadata = {
  title: "Overdue Payments — Platterly",
  robots: { index: false, follow: false },
};

const overdueFor = (days: number) => `${days} ${days === 1 ? "day" : "days"} overdue`;

export default async function OverduePaymentsPage() {
  const { organizationId, session } = await requireActiveOrganization();
  await requirePermission({ payments: ["view"] }, organizationId);
  const { locationId } = await getActiveLocation(organizationId, session.user.id);
  const [rows, canRecord, canOpenOrders] = await Promise.all([
    listOverdueOrders(organizationId, locationId),
    hasPermission({ payments: ["create"] }, organizationId),
    // The order page needs orders:edit, which e.g. the Accounts team does not have.
    hasPermission({ orders: ["edit"] }, organizationId),
  ]);

  const totalOwed = rows.reduce((sum, r) => sum + r.balance, 0);
  const tiles = [
    { label: "Overdue orders", value: String(rows.length), testId: "overdue-count" },
    { label: "Total owed", value: inr(totalOwed), testId: "overdue-total" },
    { label: "Longest overdue", value: rows.length ? overdueFor(Math.max(...rows.map((r) => r.daysOverdue))) : "—", testId: "overdue-longest" },
  ];

  const sortOptions: CatalogSortOption[] = [
    { value: "oldest", label: "Longest Overdue First", key: "days", direction: "desc" },
    { value: "amount-high", label: "Amount (High–Low)", key: "amount", direction: "desc" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
  ];

  const entries: CatalogEntry[] = rows.map((r) => {
    const label = r.orderNumber ?? "order";
    const eventLine = [longDate(r.eventEndDate), r.eventType?.name].filter(Boolean).join(" · ");
    const action = canRecord ? <RecordPaymentButton orderId={r.id} orderLabel={label} total={r.total} paid={r.paid} balance={r.balance} /> : null;
    return {
      id: r.id,
      href: canOpenOrders ? `/orders/${r.id}` : undefined,
      // The card holds a phone link and a button, so the customer name is its (stretched) link instead of the card being one.
      cardOwnsLink: true,
      searchText: `${r.orderNumber ?? ""} ${r.customer.name} ${r.customer.phone} ${r.venue ?? ""}`,
      sortValues: { days: r.daysOverdue, amount: r.balance, customer: r.customer.name },
      card: (
        <div className="relative flex h-full flex-col gap-4 p-5" data-testid="overdue-card">
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold text-primary">{r.orderNumber ?? "Order"}</span>
            <Badge variant="danger">{overdueFor(r.daysOverdue)}</Badge>
          </div>
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <User className="size-5" />
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              {canOpenOrders ? (
                <Link href={`/orders/${r.id}`} className="truncate text-base font-semibold outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring">
                  {r.customer.name}
                </Link>
              ) : (
                <span className="truncate text-base font-semibold">{r.customer.name}</span>
              )}
              <a href={`tel:${r.customer.phone}`} className="relative z-10 flex items-center gap-1.5 text-sm text-muted-foreground hover:underline">
                <Phone className="size-3.5 shrink-0" />
                {r.customer.phone}
              </a>
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="size-3.5 shrink-0" />
                <span className="truncate">{eventLine}</span>
              </span>
              {r.venue && (
                <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5 shrink-0" />
                  <span className="truncate">{r.venue}</span>
                </span>
              )}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
            <dt className="text-muted-foreground">Total</dt>
            <dd className="text-right font-medium">{inr(r.total)}</dd>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="text-right font-medium text-success">{inr(r.paid)}</dd>
          </dl>
          <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">Balance due</span>
              <span className="text-xl font-bold text-destructive">{inr(r.balance)}</span>
            </div>
            {action}
          </div>
        </div>
      ),
      listRow: (
        <>
          <TableCell className="px-3 py-3 font-semibold text-primary">{r.orderNumber ?? "—"}</TableCell>
          <TableCell className="px-3 py-3">
            <div className="flex flex-col gap-0.5">
              <span className="max-w-44 truncate font-semibold">{r.customer.name}</span>
              <a href={`tel:${r.customer.phone}`} className="relative z-10 text-xs text-muted-foreground hover:underline">
                {r.customer.phone}
              </a>
            </div>
          </TableCell>
          <TableCell className="px-3 py-3 text-sm text-muted-foreground">{eventLine}</TableCell>
          <TableCell className="px-3 py-3">
            <Badge variant="danger">{overdueFor(r.daysOverdue)}</Badge>
          </TableCell>
          <TableCell className="px-3 py-3 font-medium tabular-nums">{inr(r.total)}</TableCell>
          <TableCell className="px-3 py-3 font-medium text-success tabular-nums">{inr(r.paid)}</TableCell>
          <TableCell className="px-3 py-3 font-semibold text-destructive tabular-nums">{inr(r.balance)}</TableCell>
          <TableCell className="px-3 py-3">{action}</TableCell>
        </>
      ),
    };
  });

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Finance" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Finance</h1>
        <p className="text-sm text-muted-foreground">
          Orders whose event is over and money is still owed. Cancelled orders are left out. Record a payment here and the order drops off once it is paid in full.
        </p>
      </div>
      <SectionTabs group="finance" active="/overdue-payments" organizationId={organizationId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="text-xs text-muted-foreground">{t.label}</span>
            <span className="text-xl font-bold tabular-nums" data-testid={t.testId}>
              {t.value}
            </span>
          </div>
        ))}
      </div>
      <CatalogBrowser
        entries={entries}
        columns={["Order", "Customer", "Event", "Overdue", "Total", "Paid", "Balance due", canRecord ? "Action" : ""]}
        searchPlaceholder="Search by order, customer, phone or venue…"
        emptyLabel="No overdue payments. Every finished event is paid in full."
        sortOptions={sortOptions}
        richList
        defaultView="list"
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]"
      />
    </div>
  );
}
