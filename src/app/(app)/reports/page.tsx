import type { Metadata } from "next";
import { requireActiveOrganization, requirePermission, hasPermission } from "@/lib/auth/require-session";
import { loadEventsReport, loadSalesReport } from "@/modules/reports/reports";
import { resolveRange, toIsoDate } from "@/modules/expenses/date-range";
import { RangeFilter } from "@/app/(app)/profitability/_components/range-filter";
import { EventsView, SalesView } from "@/components/reports/report-views";
import { ReportTabs } from "@/components/reports/report-ui";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = {
  title: "Reports — Platterly",
  robots: { index: false, follow: false },
};

type Query = { tab?: string; range?: string; from?: string; to?: string };

// Chunk 17.1 (PRD §51): the Sales and Events reports for this kitchen. Anyone with the `reports` permission can read them.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ reports: ["view"] }, organizationId);
  const query = await searchParams;
  const tab = query.tab === "events" ? "events" : "sales";
  const range = resolveRange(query);
  const scope = { organizationId };

  const [sales, events, canOpenOrders] = await Promise.all([
    tab === "sales" ? loadSalesReport(scope, range) : null,
    tab === "events" ? loadEventsReport(scope, range) : null,
    hasPermission({ orders: ["edit"] }, organizationId),
  ]);

  const keep: Record<string, string> = {};
  if (query.from || query.to) {
    if (query.from) keep.from = query.from;
    if (query.to) keep.to = query.to;
  } else if (query.range) keep.range = query.range;

  const subject = tab === "sales" ? "Orders placed" : "Events dated";
  const periodText =
    range.from || range.to
      ? `${subject} ${range.from && range.to ? `from ${toIsoDate(range.from)} to ${toIsoDate(range.to)}` : range.from ? `on or after ${toIsoDate(range.from)}` : `on or before ${toIsoDate(range.to!)}`}.`
      : `${subject}: all time.`;

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Reports" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-muted-foreground">How your catering business is doing: sales and events, for any period.</p>
      </div>
      <Separator />
      <RangeFilter preset={range.preset} from={range.from ? toIsoDate(range.from) : ""} to={range.to ? toIsoDate(range.to) : ""} basePath="/reports" extra={{ tab }} />
      <p className="text-sm text-muted-foreground" data-testid="report-period">
        {periodText}
      </p>
      <ReportTabs
        tabs={[
          { id: "sales", label: "Sales" },
          { id: "events", label: "Events" },
        ]}
        active={tab}
        basePath="/reports"
        keep={keep}
      />
      {sales && <SalesView sales={sales} />}
      {events && <EventsView events={events} orderLinks={canOpenOrders} />}
    </div>
  );
}
