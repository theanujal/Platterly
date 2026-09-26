"use client";

import { useEffect, useState } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "cn";
import { DensityLegend, DensityLine, densityBand } from "@/components/calendar/order-density";

const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDisplay(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function buildMonthGrid(viewMonth: Date): (Date | null)[] {
  const first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
  const leading = first.getDay();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface DateRangePickerProps {
  id?: string;
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  placeholder?: string;
  className?: string;
  /** "YYYY-MM-DD" — days before this are shown greyed out and can't be picked (no backdated orders). Omit to allow any day. */
  minDate?: string;
  /**
   * Optional busy-ness data (Chunk 13 Group 13.1): given a "YYYY-MM-DD"
   * window, resolves how many orders fall on each day. When provided, dates
   * with orders get a short density line under them, today is filled with its
   * own band colour, and a legend is shown. Omit for a plain picker.
   */
  loadOrderCounts?: (fromIso: string, toIso: string) => Promise<Record<string, number>>;
}

/**
 * Create Order's "Event Date" range field (2026-09-19) — replaces the old
 * separate Event Start Date / End Date inputs with one field. Built from
 * scratch (Popover + a plain month grid) rather than a new dependency, per
 * AJ's explicit choice — no calendar/date-range component existed anywhere
 * in the repo before this. Days are only greyed out when the caller passes
 * `minDate` (Create Order does, so nothing can be booked in the past); any
 * other rule stays a message-based validation next to the field.
 */
export function DateRangePicker({ id, startDate, endDate, onChange, placeholder = "Select event dates", className, minDate, loadOrderCounts }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [viewMonth, setViewMonth] = useState(() => (startDate ? parseIsoDate(startDate) : new Date()));
  const [orderCounts, setOrderCounts] = useState<Record<string, number>>({});

  // Fetch the visible month's counts whenever the popover opens or the month
  // changes. Results merge into what's already loaded so navigating back to a
  // month doesn't flash empty; a stale response is dropped via `cancelled`.
  const viewYear = viewMonth.getFullYear();
  const viewMonthIndex = viewMonth.getMonth();
  useEffect(() => {
    if (!open || !loadOrderCounts) return;
    let cancelled = false;
    const from = toIsoDate(new Date(viewYear, viewMonthIndex, 1));
    const to = toIsoDate(new Date(viewYear, viewMonthIndex + 1, 0));
    loadOrderCounts(from, to)
      .then((counts) => {
        if (!cancelled) setOrderCounts((prev) => ({ ...prev, ...counts }));
      })
      .catch(() => {
        // Busy-ness lines are a hint, never a blocker — the picker still works without them.
      });
    return () => {
      cancelled = true;
    };
  }, [open, loadOrderCounts, viewYear, viewMonthIndex]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setPendingStart(null);
      setViewMonth(startDate ? parseIsoDate(startDate) : new Date());
    }
  }

  function handleDayClick(iso: string) {
    // First click only previews (via pendingStart, below) — it deliberately
    // does NOT call onChange yet. It used to fire a transient single-day
    // range immediately, which callers (order-form.tsx's setEventDateRange)
    // treat as the real, final range — e.g. pruning meal-plan entries against
    // it — silently destroying data for every other day before the second
    // click ever lands (AJ, 2026-09-19, found in Meal Planning testing).
    if (pendingStart === null) {
      setPendingStart(iso);
      return;
    }
    const [s, e] = iso < pendingStart ? [iso, pendingStart] : [pendingStart, iso];
    onChange(s, e);
    setPendingStart(null);
    setOpen(false);
  }

  const grid = buildMonthGrid(viewMonth);
  const todayIso = toIsoDate(new Date());

  const label =
    startDate && endDate
      ? startDate === endDate
        ? formatDisplay(parseIsoDate(startDate))
        : `${formatDisplay(parseIsoDate(startDate))} – ${formatDisplay(parseIsoDate(endDate))}`
      : placeholder;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        id={id}
        type="button"
        className={cn(
          "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          !(startDate && endDate) && "text-muted-foreground",
          className,
        )}
      >
        <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[21rem] p-3">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Previous year"
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear() - 1, m.getMonth(), 1))}
            >
              <ChevronsLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Previous month"
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </button>
          </div>
          <span className="text-sm font-medium">{viewMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
          <div className="flex items-center">
            <button
              type="button"
              aria-label="Next month"
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next year"
              className="flex size-7 items-center justify-center rounded-md hover:bg-muted"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear() + 1, m.getMonth(), 1))}
            >
              <ChevronsRight className="size-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="py-1">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {grid.map((date, index) => {
            if (!date) return <div key={index} />;
            const iso = toIsoDate(date);
            // Mid-pick (pendingStart set, no second day yet), show only that
            // one day highlighted — there's no real range to shade until the
            // second click supplies an end date.
            const inRange = pendingStart ? iso === pendingStart : Boolean(startDate && endDate && iso >= startDate && iso <= endDate);
            const isEndpoint = pendingStart ? iso === pendingStart : iso === startDate || iso === endDate;
            const isToday = iso === todayIso;
            const count = orderCounts[iso] ?? 0;
            const band = densityBand(count);
            // Same rule as the Dashboard card: today alone is filled, in its
            // own legend colour; every other busy date gets a line instead.
            // A selected endpoint is already filled, so it shows no line.
            const todayFill = !inRange && isToday && band;
            const isPastMin = Boolean(minDate && iso < minDate);
            return (
              <button
                key={iso}
                type="button"
                title={count > 0 ? `${count} order${count === 1 ? "" : "s"}` : undefined}
                disabled={isPastMin}
                onClick={() => handleDayClick(iso)}
                className={cn(
                  "relative flex size-8 items-center justify-center rounded-md text-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                  inRange && !isEndpoint && "bg-accent text-accent-foreground",
                  isEndpoint && "bg-primary text-primary-foreground hover:bg-primary/90",
                  !inRange && isToday && !band && "font-semibold text-primary",
                  todayFill && band && `${band.fill} font-semibold hover:opacity-90`,
                )}
              >
                {date.getDate()}
                {!isEndpoint && !todayFill && <DensityLine count={count} className="bottom-0.5" />}
              </button>
            );
          })}
        </div>
        {loadOrderCounts && <DensityLegend className="mt-3 border-t border-border pt-3" />}
      </PopoverContent>
    </Popover>
  );
}
