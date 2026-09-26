import Link from "next/link";
import { CalendarCheck } from "lucide-react";
import type { CalendarEvent, CalendarOrder } from "@/modules/orders/calendar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DensityLine } from "@/components/calendar/order-density";
import { ORDER_STATUS_LABEL, ORDER_STATUS_VARIANT, coversDay, formatDay } from "../_lib";

interface DayListProps {
  monthKey: string;
  cells: string[];
  today: string;
  orders: CalendarOrder[];
  standaloneEvents: CalendarEvent[];
  orderCountsByDay: Record<string, number>;
}

/**
 * List view (Chunk 13 Group 13.2) — same per-day expansion as the month grid
 * (a multi-day Order appears under each day it covers) so both views always
 * agree with the counts in the header. Only days inside the month are listed.
 */
export function DayList({ monthKey, cells, today, orders, standaloneEvents, orderCountsByDay }: DayListProps) {
  const days = cells
    .filter((d) => d.startsWith(monthKey))
    .map((day) => ({
      day,
      orders: orders.filter((o) => coversDay(o.startDate, o.endDate, day)),
      events: standaloneEvents.filter((e) => coversDay(e.startDate, e.endDate, day)),
    }))
    .filter((d) => d.orders.length > 0 || d.events.length > 0);

  if (days.length === 0) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No orders or events this month.</Card>;
  }

  return (
    <div className="flex flex-col gap-3">
      {days.map(({ day, orders: dayOrders, events: dayEvents }) => (
        <Card key={day} data-testid={`calendar-list-day-${day}`} className="gap-0 p-0">
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <span className="relative flex h-7 min-w-24 items-center text-sm font-semibold">
              {formatDay(day)}
              {day !== today && <DensityLine count={orderCountsByDay[day] ?? 0} className="bottom-0 left-0" />}
            </span>
            {day === today && <Badge variant="info">Today</Badge>}
            <span className="ml-auto text-xs text-muted-foreground">
              {dayOrders.length} order{dayOrders.length === 1 ? "" : "s"}
              {dayEvents.length > 0 && ` · ${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {dayOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders/${o.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm hover:bg-muted/50">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">{o.orderNumber ?? "Order"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{o.customerName}</span>
                  <span className="text-xs text-muted-foreground">
                    {[o.eventTypeName, o.guests ? `${o.guests} guests` : null, o.venue].filter(Boolean).join(" · ")}
                  </span>
                  {o.startDate !== o.endDate && (
                    <span className="text-xs text-muted-foreground">
                      {formatDay(o.startDate, { day: "numeric", month: "short" })} – {formatDay(o.endDate, { day: "numeric", month: "short" })}
                    </span>
                  )}
                  {o.hasEvent && <CalendarCheck aria-label="Has an Event" className="size-4 text-info" />}
                  <Badge variant={ORDER_STATUS_VARIANT[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>
                </Link>
              </li>
            ))}
            {dayEvents.map((e) => {
              const row = (
                <>
                  <span className="w-20 shrink-0 text-xs text-info">Event</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{e.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {[e.customerName, e.guests ? `${e.guests} guests` : null, e.venue].filter(Boolean).join(" · ")}
                  </span>
                </>
              );
              const cls = "flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm";
              return (
                <li key={e.id}>
                  {e.orderId ? (
                    <Link href={`/orders/${e.orderId}`} className={`${cls} hover:bg-muted/50`}>
                      {row}
                    </Link>
                  ) : (
                    <div className={cls}>{row}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ))}
    </div>
  );
}
