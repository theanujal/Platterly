"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { CardFooterLink } from "./card-footer-link";
import { DensityLegend, DensityLine, densityBand } from "@/components/calendar/order-density";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface OrdersCalendarCardProps {
  /** "YYYY-MM-DD" -> order count that day, pre-fetched for a multi-month
   *  window server-side (see ../_data.ts) so month navigation here stays
   *  client-only with no extra round trip. */
  orderCountsByDay: Record<string, number>;
}

export function OrdersCalendarCard({ orderCountsByDay }: OrdersCalendarCardProps) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  // Fixed 6-week (42-cell) grid so the card doesn't change height between
  // months; leading/trailing cells are the adjacent months' real dates.
  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    return Array.from({ length: 42 }, (_, i) => new Date(year, month, i - firstWeekday + 1));
  }, [cursor]);

  const todayKey = dateKey(today);

  return (
    <Card>
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
              <CalendarDays className="size-4" />
            </div>
            <CardTitle className="whitespace-nowrap">Orders Calendar</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous month"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <span className="px-1 text-center text-xs font-medium whitespace-nowrap">
              {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              aria-label="Next month"
              onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAY_LABELS.map((label, i) => (
            <span key={i} className="py-1 font-medium text-muted-foreground">
              {label}
            </span>
          ))}
          {cells.map((day) => {
            const key = dateKey(day);
            const count = orderCountsByDay[key] ?? 0;
            const band = densityBand(count);
            const isToday = key === todayKey;
            const inMonth = day.getMonth() === cursor.getMonth();
            // Today is the only date that gets a filled highlight, in its own
            // legend colour; every other date just gets a line under it.
            const todayClass = isToday ? (band ? band.fill : "bg-primary/10 font-semibold text-primary") : "";
            return (
              <span
                key={key}
                title={count > 0 ? `${count} order${count === 1 ? "" : "s"}` : undefined}
                className={`relative flex aspect-square items-center justify-center rounded-md text-[13px] ${
                  isToday ? todayClass : inMonth ? "text-foreground" : "text-muted-foreground/50"
                }`}
              >
                {day.getDate()}
                {!isToday && <DensityLine count={count} faded={!inMonth} />}
              </span>
            );
          })}
        </div>
        <DensityLegend className="border-t border-border pt-3" />
        <CardFooterLink href="/calendar" label="View full calendar" />
      </CardContent>
    </Card>
  );
}
