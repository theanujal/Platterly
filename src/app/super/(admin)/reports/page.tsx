import type { Metadata } from "next";
import { requireSuperAdmin } from "@/lib/auth/require-session";
import { loadEventsReport, loadSalesReport, loadSignupsByMonth } from "@/modules/reports/reports";
import { resolveRange, toIsoDate } from "@/modules/expenses/date-range";
import { inr } from "@/modules/invoices/invoice-format";
import { RangeFilter } from "@/app/(app)/profitability/_components/range-filter";
import { EventsView, SalesView } from "@/components/reports/report-views";
import { BarList, ReportSection, ReportTabs, ReportTile } from "@/components/reports/report-ui";
import { PageHeader } from "../_components/page-header";

export const metadata: Metadata = {
  title: "Reports — Super Admin",
  robots: { index: false, follow: false },
};

type Query = { tab?: string; range?: string; from?: string; to?: string };

// Chunk 17.1: the same Sales and Events reports as each kitchen sees, added up across every kitchen, plus how the
// kitchens compare and how fast new ones sign up. Super Admin only.
export default async function PlatformReportsPage({ searchParams }: { searchParams: Promise<Query> }) {
  await requireSuperAdmin();
  const query = await searchParams;
  const tab = query.tab === "events" ? "events" : "sales";
  const range = resolveRange(query);
  const scope = { all: true } as const;

  const [sales, events, signups] = await Promise.all([
    tab === "sales" ? loadSalesReport(scope, range) : null,
    tab === "events" ? loadEventsReport(scope, range) : null,
    tab === "sales" ? loadSignupsByMonth(range) : null,
  ]);

  const keep: Record<string, string> = {};
  if (query.from || query.to) {
    if (query.from) keep.from = query.from;
    if (query.to) keep.to = query.to;
  } else if (query.range) keep.range = query.range;

  return (
    <>
      <PageHeader crumbs={[{ label: "Reports" }]} title="Reports" description="Sales and events across every caterer on the platform." />
      <RangeFilter preset={range.preset} from={range.from ? toIsoDate(range.from) : ""} to={range.to ? toIsoDate(range.to) : ""} basePath="/super/reports" extra={{ tab }} />
      <ReportTabs
        tabs={[
          { id: "sales", label: "Sales" },
          { id: "events", label: "Events" },
        ]}
        active={tab}
        basePath="/super/reports"
        keep={keep}
      />
      {sales && signups && (
        <>
          <SalesView sales={sales} />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <ReportTile label="Caterers on the platform" value={signups.total.toLocaleString("en-IN")} testId="platform-caterers" />
            <ReportTile label="New caterers in the period" value={signups.inRange.toLocaleString("en-IN")} testId="platform-new-caterers" />
            <ReportTile label="Kitchens with orders" value={sales.kitchens.length.toLocaleString("en-IN")} testId="platform-active-kitchens" />
          </div>
          <ReportSection title="Caterer sign-ups by month">
            <BarList rows={signups.byMonth.map((m) => ({ label: m.label, value: m.count, text: `${m.count}` }))} />
          </ReportSection>
          <ReportSection title="Kitchens" description="Every kitchen with orders in the period, biggest revenue first.">
            {sales.kitchens.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Nothing in this period.</p>
            ) : (
              <div className="overflow-x-auto" data-testid="platform-kitchens">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
                      <th className="py-2 pr-4 font-bold">Kitchen</th>
                      <th className="py-2 pr-4 text-right font-bold">Orders</th>
                      <th className="py-2 pr-4 text-right font-bold">Guests</th>
                      <th className="py-2 pr-4 text-right font-bold">Average order</th>
                      <th className="py-2 text-right font-bold">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sales.kitchens.map((k) => (
                      <tr key={k.kitchenId} className="border-t border-border">
                        <td className="py-2 pr-4 font-medium">{k.kitchenName}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{k.orders.toLocaleString("en-IN")}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{k.guests.toLocaleString("en-IN")}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{k.averageOrderValue === null ? "—" : inr(k.averageOrderValue)}</td>
                        <td className="py-2 text-right font-medium tabular-nums">{inr(k.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportSection>
        </>
      )}
      {events && <EventsView events={events} orderLinks={false} showKitchen />}
    </>
  );
}
