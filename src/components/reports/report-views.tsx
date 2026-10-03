import Link from "next/link";
import { inr, longDate } from "@/modules/invoices/invoice-format";
import { monthLabel, type EventsReport, type SalesReport } from "@/modules/reports/report-math";
import { BarList, ReportSection, ReportTile } from "./report-ui";

/** The Sales and Events views, shared by the kitchen's Reports page and the Super Admin platform report. */

const percent = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`);
const whole = (n: number) => n.toLocaleString("en-IN");

export function SalesView({ sales }: { sales: SalesReport }) {
  return (
    <div className="flex flex-col gap-4" data-testid="sales-report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        <ReportTile label="Revenue (order totals)" value={inr(sales.revenue)} testId="sales-revenue" />
        <ReportTile label="Orders" value={whole(sales.orders)} hint="Cancelled orders are left out" testId="sales-orders" />
        <ReportTile label="Average order value" value={sales.averageOrderValue === null ? "—" : inr(sales.averageOrderValue)} testId="sales-aov" />
        <ReportTile label="Confirmed order value" value={inr(sales.confirmedOrderValue)} hint={`${whole(sales.confirmedOrders)} approved, in the kitchen or completed`} testId="sales-confirmed" />
        <ReportTile label="Enquiries" value={whole(sales.enquiries)} hint="People added in the period" testId="sales-enquiries" />
        <ReportTile label="Conversion rate" value={percent(sales.conversionRate)} hint={`${whole(sales.converted)} of ${whole(sales.enquiries)} placed an order`} testId="sales-conversion" />
        <ReportTile label="Quotation value" value={inr(sales.quotationValue)} hint={`${whole(sales.quotationsSent)} sent, drafts not counted`} testId="sales-quotations" />
        <ReportTile label="Accepted quotation value" value={inr(sales.acceptedQuotationValue)} testId="sales-accepted" />
      </div>
      <ReportSection title="Revenue by month" description="Orders counted in the month they were placed.">
        <BarList rows={sales.revenueByMonth.map((m) => ({ label: m.label, value: m.revenue, text: inr(m.revenue), sub: `${whole(m.count)} ${m.count === 1 ? "order" : "orders"}` }))} />
      </ReportSection>
    </div>
  );
}

export function EventsView({ events, orderLinks, showKitchen = false }: { events: EventsReport; orderLinks: boolean; showKitchen?: boolean }) {
  return (
    <div className="flex flex-col gap-4" data-testid="events-report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <ReportTile label="Events" value={whole(events.events)} hint="Cancelled orders are left out" testId="events-count" />
        <ReportTile label="Total guests" value={whole(events.guests)} testId="events-guests" />
        <ReportTile label="Average guests per event" value={events.averageGuests === null ? "—" : whole(events.averageGuests)} testId="events-average" />
        <ReportTile label="Revenue (order totals)" value={inr(events.revenue)} testId="events-revenue" />
      </div>
      <ReportSection title="Events by month" description="By the date of the event.">
        <BarList rows={events.byMonth.map((m) => ({ label: m.label, value: m.count, text: `${whole(m.count)} ${m.count === 1 ? "event" : "events"}`, sub: `${whole(m.guests)} guests · ${inr(m.revenue)}` }))} />
      </ReportSection>
      <ReportSection title="Events by type">
        {events.byType.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing in this period.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="events-by-type">
            <table className="w-full min-w-[28rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-bold">Type</th>
                  <th className="py-2 pr-4 text-right font-bold">Events</th>
                  <th className="py-2 pr-4 text-right font-bold">Guests</th>
                  <th className="py-2 text-right font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {events.byType.map((t) => (
                  <tr key={t.name} className="border-t border-border">
                    <td className="py-2 pr-4 font-medium">{t.name}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{whole(t.count)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{whole(t.guests)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{inr(t.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>
      <ReportSection title="Revenue per event" description="The biggest events in the period by revenue (up to 20).">
        {events.topEvents.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Nothing in this period.</p>
        ) : (
          <div className="overflow-x-auto" data-testid="events-top">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-xs font-bold tracking-wider text-muted-foreground uppercase">
                  <th className="py-2 pr-4 font-bold">Order</th>
                  <th className="py-2 pr-4 font-bold">Customer</th>
                  <th className="py-2 pr-4 font-bold">Event date</th>
                  <th className="py-2 pr-4 font-bold">Type</th>
                  <th className="py-2 pr-4 text-right font-bold">Guests</th>
                  <th className="py-2 text-right font-bold">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {events.topEvents.map((o) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="py-2 pr-4 font-semibold text-primary">
                      {orderLinks ? (
                        <Link href={`/orders/${o.id}`} className="hover:underline">
                          {o.orderNumber ?? "Order"}
                        </Link>
                      ) : (
                        (o.orderNumber ?? "Order")
                      )}
                      {showKitchen && o.kitchenName && <span className="block text-xs font-normal text-muted-foreground">{o.kitchenName}</span>}
                    </td>
                    <td className="py-2 pr-4">{o.customerName}</td>
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{longDate(o.eventStartDate)}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{o.eventType ?? "—"}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{o.guests === null ? "—" : whole(o.guests)}</td>
                    <td className="py-2 text-right font-medium tabular-nums">{inr(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ReportSection>
    </div>
  );
}

export { monthLabel };
