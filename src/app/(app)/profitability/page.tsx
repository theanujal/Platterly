import type { Metadata } from "next";
import { User, CalendarDays, MapPin, ChevronRight } from "lucide-react";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { listProfitability } from "@/modules/expenses/expense";
import { resolveRange, toIsoDate } from "@/modules/expenses/date-range";
import { RangeFilter } from "./_components/range-filter";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { ExportMenu } from "@/components/reports/export-menu";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { TableCell } from "@/components/ui/table";
import { CatalogBrowser, type CatalogEntry, type CatalogSortOption } from "@/components/catalog/catalog-browser";
import { cn } from "cn";

export const metadata: Metadata = {
  title: "Profitability — Platterly",
  robots: { index: false, follow: false },
};

const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const profitTone = (profit: number) => (profit < 0 ? "text-destructive" : "text-success");

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string }> }) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ expenses: ["view"] }, organizationId);
  const range = resolveRange(await searchParams);
  const query = await searchParams;
  const [rows, canOpenOrders, canExport] = await Promise.all([listProfitability(organizationId, range), hasPermission({ orders: ["edit"] }, organizationId), hasPermission({ reports: ["export"] }, organizationId)]);

  const revenue = rows.reduce((s, r) => s + r.revenue, 0);
  const cost = rows.reduce((s, r) => s + r.totalCost, 0);
  const profit = revenue - cost;
  const tiles = [
    { label: "Revenue (order totals)", value: inr(revenue), testId: "total-revenue" },
    { label: "Total cost", value: inr(cost), testId: "total-cost" },
    { label: profit < 0 ? "Loss" : "Profit", value: inr(profit), tone: profitTone(profit), testId: "total-profit" },
    { label: "Profit margin", value: percent(revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : null), testId: "total-margin" },
  ];

  const sortOptions: CatalogSortOption[] = [
    { value: "newest", label: "Event Date (Newest)", key: "newest", direction: "desc" },
    { value: "profit-high", label: "Profit (High–Low)", key: "profit", direction: "desc" },
    { value: "profit-low", label: "Profit (Low–High)", key: "profit" },
    { value: "customer", label: "Customer (A–Z)", key: "customer" },
  ];

  const entries: CatalogEntry[] = rows.map((r) => ({
    id: r.orderId,
    // The order page needs orders:edit, which e.g. the Accounts team does not have.
    href: canOpenOrders ? `/orders/${r.orderId}` : undefined,
    searchText: `${r.orderNumber ?? ""} ${r.customerName} ${r.eventTypeName ?? ""} ${r.venue ?? ""}`,
    sortValues: { customer: r.customerName, profit: r.profit, newest: r.eventStartDate.getTime() },
    card: (
      <div className="flex h-full flex-col gap-4 p-5" data-testid="profit-card">
        <div className="flex items-start justify-between gap-3">
          <span className="text-sm font-semibold text-primary">{r.orderNumber ?? "Order"}</span>
          <span className="text-xs text-muted-foreground">{r.expenseCount} {r.expenseCount === 1 ? "expense" : "expenses"}</span>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <User className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-base font-semibold">{r.customerName}</span>
            <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays className="size-3.5 shrink-0" />
              <span className="truncate">{[longDate(r.eventStartDate), r.eventTypeName].filter(Boolean).join(" · ")}</span>
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
          <dt className="text-muted-foreground">Revenue</dt>
          <dd className="text-right font-medium">{inr(r.revenue)}</dd>
          <dt className="text-muted-foreground">Cost</dt>
          <dd className="text-right font-medium">{inr(r.totalCost)}</dd>
          <dt className="text-muted-foreground">Food cost</dt>
          <dd className="text-right font-medium">{percent(r.foodCostPercent)}</dd>
        </dl>
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">{r.profit < 0 ? "Loss" : "Profit"}</span>
            <span className={cn("text-xl font-bold", profitTone(r.profit))}>{inr(r.profit)}</span>
          </div>
          <span className="text-sm font-semibold">{percent(r.marginPercent)} margin</span>
        </div>
      </div>
    ),
    listRow: (
      <>
        <TableCell className="px-3 py-3 font-semibold text-primary">{r.orderNumber ?? "—"}</TableCell>
        <TableCell className="px-3 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="max-w-44 truncate font-semibold">{r.customerName}</span>
            <span className="text-xs text-muted-foreground">{[longDate(r.eventStartDate), r.eventTypeName].filter(Boolean).join(" · ")}</span>
          </div>
        </TableCell>
        <TableCell className="px-3 py-3 font-medium tabular-nums">{inr(r.revenue)}</TableCell>
        <TableCell className="px-3 py-3 font-medium tabular-nums">{inr(r.totalCost)}</TableCell>
        <TableCell className={cn("px-3 py-3 font-semibold tabular-nums", profitTone(r.profit))}>{inr(r.profit)}</TableCell>
        <TableCell className="px-3 py-3 text-sm">{percent(r.marginPercent)}</TableCell>
        <TableCell className="px-3 py-3 text-sm">{percent(r.foodCostPercent)}</TableCell>
        <TableCell className="px-3 py-3 text-muted-foreground">
          <ChevronRight className="size-4" aria-hidden />
        </TableCell>
      </>
    ),
  }));

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Profitability" }]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Profitability</h1>
          <p className="text-sm text-muted-foreground">Profit on every order: the order total minus the expenses recorded on its Expenses tab. Cancelled orders are left out.</p>
        </div>
        {canExport && <ExportMenu href="/profitability/export" params={{ range: query.range, from: query.from, to: query.to }} />}
      </div>
      <Separator />
      <div className="flex flex-col gap-3">
        <RangeFilter preset={range.preset} from={range.preset === "custom" && range.from ? toIsoDate(range.from) : ""} to={range.preset === "custom" && range.to ? toIsoDate(range.to) : ""} />
        <p className="text-sm text-muted-foreground" data-testid="range-summary">
          {range.from || range.to
            ? `Orders whose event is ${range.from ? `from ${longDate(range.from)}` : ""}${range.from && range.to ? " " : ""}${range.to ? `${range.from ? "to" : "up to"} ${longDate(range.to)}` : ""}: ${rows.length} ${rows.length === 1 ? "order" : "orders"}.`
            : `All orders: ${rows.length} ${rows.length === 1 ? "order" : "orders"}.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <span className="text-xs text-muted-foreground">{t.label}</span>
            <span className={cn("text-xl font-bold tabular-nums", t.tone)} data-testid={t.testId}>
              {t.value}
            </span>
          </div>
        ))}
      </div>
      <CatalogBrowser
        entries={entries}
        columns={["Order", "Customer / Event", "Revenue", "Cost", "Profit", "Margin", "Food cost", "Open order"]}
        searchPlaceholder="Search by order, customer, event or venue…"
        emptyLabel={range.from || range.to ? "No orders with an event in this period." : "No orders yet. Profit shows here once orders exist."}
        sortOptions={sortOptions}
        richList
        defaultView="list"
        gridColumnsClassName="grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))]"
        pageSize={16}
      />
    </div>
  );
}
