import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardHeader, CardTitle, CardAction, CardContent } from "@/components/ui/card";

interface UpcomingEvent {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  venue: string | null;
  customerName: string;
  eventTypeName: string;
  /** Real Events are only ever created from an Order and edited inline on
   *  that Order's detail page — there is no standalone Event page to link
   *  to, so each row links back to its parent Order instead. */
  orderId: string | null;
}

// Replaces the old static month-grid widget (never plotted real events) and
// the "Upcoming Orders" placeholder (never wired to data) with one real,
// scannable list — with a proper empty state instead of a large blank box.
export function UpcomingEventsCard({ events }: { events: UpcomingEvent[] }) {
  return (
    <Card id="upcoming-events" className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
            <CalendarDays className="size-4" />
          </div>
          <CardTitle>Upcoming Events</CardTitle>
        </div>
        <CardAction>
          <Link href="/orders" className="text-xs font-medium text-muted-foreground hover:text-foreground">
            View orders
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border py-10 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarDays className="size-5" />
            </div>
            <div>
              <p className="text-sm font-medium">No upcoming events</p>
              <p className="text-xs text-muted-foreground">Create an event from an order to see it here.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {events.map((event) => {
              const rowContent = (
                <>
                  <div className="flex size-11 shrink-0 flex-col items-center justify-center rounded-lg bg-muted leading-none">
                    <span className="text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                      {event.startDate.toLocaleDateString("en-IN", { month: "short" })}
                    </span>
                    <span className="text-base font-semibold">{event.startDate.getDate()}</span>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{event.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {event.customerName} · {event.eventTypeName}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </span>
                  </div>
                </>
              );
              return event.orderId ? (
                <Link
                  key={event.id}
                  href={`/orders/${event.orderId}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors first:pt-0 last:pb-0 hover:bg-muted/40"
                >
                  {rowContent}
                </Link>
              ) : (
                <div key={event.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  {rowContent}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
