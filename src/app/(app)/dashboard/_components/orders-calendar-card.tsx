"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Order-density color band, matching the legend rendered below the grid. */
function densityClass(count: number): string {
  if (count === 0) return "";
  if (count === 1) return "bg-emerald-500 text-white";
  if (count <= 3) return "bg-amber-400 text-white";
  if (count <= 6) return "bg-orange-500 text-white";
  return "bg-rose-600 text-white";
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

  const cells = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = new Date(year, month, 1).getDay();
    const leading: null[] = Array(firstWeekday).fill(null);
    const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
    return [...leading, ...days];
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
            <CardTitle>Orders Calendar</CardTitle>
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
            <span className="w-24 text-center text-xs font-medium">
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
          {cells.map((day, i) => {
            if (!day) return <span key={i} />;
            const key = dateKey(day);
            const count = orderCountsByDay[key] ?? 0;
            const isToday = key === todayKey;
            return (
              <span
                key={i}
                title={count > 0 ? `${count} order${count === 1 ? "" : "s"}` : undefined}
                className={`flex aspect-square items-center justify-center rounded-md text-[13px] ${
                  count > 0 ? densityClass(count) : isToday ? "bg-primary/10 font-semibold text-primary" : "text-foreground"
                }`}
              >
                {day.getDate()}
              </span>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-emerald-500" /> 1 order
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-amber-400" /> 2-3 orders
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-orange-500" /> 4-6 orders
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-full bg-rose-600" /> 7+ orders
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
