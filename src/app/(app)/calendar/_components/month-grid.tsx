import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import { cn } from "cn";
import type { CalendarEvent, CalendarOrder } from "@/modules/orders/calendar";
import { DensityLine, densityBand } from "@/components/calendar/order-density";
import { coversDay, formatDay } from "../_lib";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_CHIPS = 3;

interface MonthGridProps {
  monthKey: string;
  cells: string[];
  today: string;
  orders: CalendarOrder[];
  /** Events with no Order in this view — an Event that has its own Order shows as a marker on that Order's chip instead. */
  standaloneEvents: CalendarEvent[];
  orderCountsByDay: Record<string, number>;
  listHref: string;
}

/**
 * Month view (Chunk 13 Group 13.2). Same rules as the Dashboard card: a line
 * under the date shows that day's order-count band, only today is filled (in
 * its band colour), adjacent-month days are faded. Bigger cells here also
 * list the actual Orders/Events so a day can be read without leaving the page.
 */
export function MonthGrid({ monthKey, cells, today, orders, standaloneEvents, orderCountsByDay, listHref }: MonthGridProps) {
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="bg-muted px-2 py-2 text-center text-xs font-medium text-muted-foreground">
            {w}
          </div>
        ))}
        {cells.map((day) => {
          const inMonth = day.startsWith(monthKey);
          const isToday = day === today;
          const count = orderCountsByDay[day] ?? 0;
          const band = densityBand(count);
          const dayOrders = orders.filter((o) => coversDay(o.startDate, o.endDate, day));
          const dayEvents = standaloneEvents.filter((e) => coversDay(e.startDate, e.endDate, day));
          const items = [
            ...dayOrders.map((o) => ({ kind: "order" as const, o })),
            ...dayEvents.map((e) => ({ kind: "event" as const, e })),
          ];
          const shown = items.slice(0, MAX_CHIPS);
          const hidden = items.length - shown.length;
          return (
            <div
              key={day}
              data-testid={`calendar-day-${day}`}
              data-order-count={count}
              className={cn("flex min-h-28 flex-col gap-1 bg-card p-1.5", !inMonth && "bg-muted/30")}
            >
              <span
                aria-label={formatDay(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                className={cn(
                  "relative flex h-7 w-8 items-center justify-center self-start rounded-md text-sm",
                  isToday ? (band ? `${band.fill} font-semibold` : "bg-primary/10 font-semibold text-primary") : inMonth ? "text-foreground" : "text-muted-foreground/50",
                )}
              >
                {Number(day.slice(8))}
                {!isToday && <DensityLine count={count} faded={!inMonth} className="bottom-0" />}
              </span>
              {shown.map((item) =>
                item.kind === "order" ? (
                  <Link
                    key={`o-${item.o.id}`}
                    href={`/orders/${item.o.id}`}
                    title={`${item.o.orderNumber ?? "Order"} · ${item.o.customerName}${item.o.guests ? ` · ${item.o.guests} guests` : ""}`}
                    className={cn(
                      "flex items-center gap-1 truncate rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground hover:bg-orange-200",
                      !inMonth && "opacity-60",
                    )}
                  >
                    <span className="truncate">{item.o.customerName}</span>
                    {item.o.hasEvent && <CalendarCheck aria-label="Has an Event" className="ml-auto size-3 shrink-0" />}
                  </Link>
                ) : (
                  <ChipEvent key={`e-${item.e.id}`} event={item.e} faded={!inMonth} />
                ),
              )}
              {hidden > 0 && (
                <Link href={listHref} className="px-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline">
                  +{hidden} more
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChipEvent({ event, faded }: { event: CalendarEvent; faded: boolean }) {
  const className = cn("flex items-center gap-1 truncate rounded bg-info/10 px-1.5 py-0.5 text-[11px] font-medium text-info", faded && "opacity-60");
  const inner = (
    <>
      <CalendarCheck className="size-3 shrink-0" />
      <span className="truncate">{event.name}</span>
    </>
  );
  return event.orderId ? (
    <Link href={`/orders/${event.orderId}`} title={`Event · ${event.name}`} className={cn(className, "hover:bg-info/15")}>
      {inner}
    </Link>
  ) : (
    <span title={`Event · ${event.name}`} className={className}>
      {inner}
    </span>
  );
}
