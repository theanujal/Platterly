import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List as ListIcon, AlertTriangle, PackageX, Users } from "lucide-react";
import { requireActiveOrganization, requirePermission } from "@/lib/auth/require-session";
import { getCalendarData } from "@/modules/orders/calendar";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "cn";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PageBreadcrumb } from "@/components/ui/breadcrumb";
import { DensityLegend } from "@/components/calendar/order-density";
import { MonthGrid } from "./_components/month-grid";
import { DayList } from "./_components/day-list";
import { addDays, addMonths, formatDay, monthGrid, monthLabel, parseMonthParam, todayIso } from "./_lib";

export const metadata: Metadata = {
  title: "Calendar — Platterly",
  robots: { index: false, follow: false },
};

// Read live on every request — the whole point of this page is that its
// numbers match the Orders/Events tables exactly (Chunk 13 Group 13.2 Verify).
export const dynamic = "force-dynamic";

interface CalendarPageProps {
  searchParams: Promise<{ month?: string; view?: string }>;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-2xl font-semibold" data-testid={`stat-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
          {value}
        </span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </CardContent>
    </Card>
  );
}

export default async function CalendarPage({ searchParams }: CalendarPageProps) {
  const { organizationId } = await requireActiveOrganization();
  await requirePermission({ orders: ["view"] }, organizationId);

  const params = await searchParams;
  const today = todayIso();
  const monthKey = parseMonthParam(params.month, today);
  const view = params.view === "list" ? "list" : "month";

  const cells = monthGrid(monthKey);
  const monthStart = `${monthKey}-01`;
  const monthEnd = addDays(addMonths(monthKey, 1) + "-01", -1);

  const [data, upcoming] = await Promise.all([
    getCalendarData(organizationId, cells[0], cells[cells.length - 1]),
    getCalendarData(organizationId, today, addDays(today, 6)),
  ]);

  const orderIds = new Set(data.orders.map((o) => o.id));
  const standaloneEvents = data.events.filter((e) => !e.orderId || !orderIds.has(e.orderId));

  // Insights, all derived from the same fetched rows the grid renders.
  const monthOrders = data.orders.filter((o) => o.startDate <= monthEnd && o.endDate >= monthStart);
  const monthDays = cells.filter((d) => d.startsWith(monthKey));
  const busiest = monthDays.reduce<{ day: string; count: number } | null>((best, day) => {
    const count = data.orderCountsByDay[day] ?? 0;
    return count > 0 && (!best || count > best.count) ? { day, count } : best;
  }, null);
  const eventDays = monthDays.filter((d) => (data.eventCountsByDay[d] ?? 0) > 0).length;
  const heavyDays = monthDays.filter((d) => (data.orderCountsByDay[d] ?? 0) >= 7);

  const href = (m: string, v = view) => `/calendar?month=${m}&view=${v}`;
  const currentMonth = today.slice(0, 7);

  return (
    <div className="flex flex-col gap-4 p-6 md:p-8">
      <PageBreadcrumb items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Calendar" }]} />
      <div>
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="text-sm text-muted-foreground">How busy each day is — orders and events at a glance, and where a day might get tight.</p>
      </div>
      <Separator />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders this month" value={String(monthOrders.length)} hint={monthLabel(monthKey)} />
        <StatCard label="Next 7 days" value={String(upcoming.orders.length)} hint={upcoming.orders.length === 1 ? "order coming up" : "orders coming up"} />
        <StatCard
          label="Busiest day"
          value={busiest ? formatDay(busiest.day, { day: "numeric", month: "short" }) : "—"}
          hint={busiest ? `${busiest.count} order${busiest.count === 1 ? "" : "s"}` : "No orders this month"}
        />
        <StatCard label="Days with events" value={String(eventDays)} hint={monthLabel(monthKey)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(addMonths(monthKey, -1))} aria-label="Previous month" className={buttonVariants({ variant: "outline", size: "md" })}>
            <ChevronLeft className="size-4" />
          </Link>
          <h2 className="w-44 text-center text-lg font-semibold" data-testid="calendar-month-label">
            {monthLabel(monthKey)}
          </h2>
          <Link href={href(addMonths(monthKey, 1))} aria-label="Next month" className={buttonVariants({ variant: "outline", size: "md" })}>
            <ChevronRight className="size-4" />
          </Link>
          {monthKey !== currentMonth && (
            <Link href={href(currentMonth)} className={buttonVariants({ variant: "outline", size: "md" })}>
              Today
            </Link>
          )}
        </div>
        {/* Same segmented control as CatalogBrowser's Grid/List toggle, but as real links so the view lives in the URL. */}
        <div className="flex shrink-0 gap-1 rounded-lg border border-input p-0.5">
          <Link
            href={href(monthKey, "month")}
            aria-current={view === "month" ? "page" : undefined}
            className={cn(buttonVariants({ variant: view === "month" ? "default" : "ghost", size: "sm" }), "h-10 gap-1.5 px-3 text-sm")}
          >
            <CalendarDays className="size-4" />
            Month
          </Link>
          <Link
            href={href(monthKey, "list")}
            aria-current={view === "list" ? "page" : undefined}
            className={cn(buttonVariants({ variant: view === "list" ? "default" : "ghost", size: "sm" }), "h-10 gap-1.5 px-3 text-sm")}
          >
            <ListIcon className="size-4" />
            List
          </Link>
        </div>
      </div>

      {view === "month" ? (
        <MonthGrid
          monthKey={monthKey}
          cells={cells}
          today={today}
          orders={data.orders}
          standaloneEvents={standaloneEvents}
          orderCountsByDay={data.orderCountsByDay}
          listHref={href(monthKey, "list")}
        />
      ) : (
        <DayList monthKey={monthKey} cells={cells} today={today} orders={data.orders} standaloneEvents={standaloneEvents} orderCountsByDay={data.orderCountsByDay} />
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <DensityLegend />
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="size-2.5 rounded-sm bg-info/20" /> Event
        </span>
        <span className="text-[11px] text-muted-foreground">A multi-day order counts on every day it runs. Only approved, sent-to-kitchen and completed orders are shown.</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" />
            Where it might get tight
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <div data-testid="watch-heavy-days">
            <p className="font-medium">Heavy days (7+ orders)</p>
            <p className="text-muted-foreground">
              {heavyDays.length > 0 ? heavyDays.map((d) => `${formatDay(d, { day: "numeric", month: "short" })} (${data.orderCountsByDay[d]})`).join(" · ") : `None in ${monthLabel(monthKey)}.`}
            </p>
          </div>
          <div data-testid="watch-inventory">
            <p className="flex items-center gap-1.5 font-medium">
              <PackageX className="size-4 text-muted-foreground" /> Inventory
            </p>
            {data.inventoryConstraints.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {data.inventoryConstraints.map((i) => (
                  <li key={i.inventoryId}>
                    {i.name}: {i.required} {i.unit} needed across upcoming events, {i.inStock} in stock
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">No shortfalls against the inventory listed on upcoming events. Recipe-based needs will be included once Recipes ship.</p>
            )}
          </div>
          <div data-testid="watch-staffing">
            <p className="flex items-center gap-1.5 font-medium">
              <Users className="size-4 text-muted-foreground" /> Staffing
            </p>
            <p className="text-muted-foreground">Staff clashes will show here once employee scheduling ships. Until then, heavy days above are the best signal.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
