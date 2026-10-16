"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { describeRange, daysInRange, MAX_RANGE_DAYS, PRESETS, presetOf, presetRange, type DateRange, type PresetKey } from "@/lib/time/date-range";
import { cn } from "cn";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const show = (iso: string) => parse(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const rangeText = describeRange;

function monthCells(year: number, month: number): (string | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = Array(first.getDay()).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * The Dashboard's date range (AJ, 2026-10-14): shown at the top right instead of the plain date. Presets and a calendar
 * with Apply and Cancel; nothing is requested while dates are being picked, only Apply puts the range in the address
 * (`?from=&to=`), which makes the page recompute the figures that follow it. The kitchen's own "today" comes from the
 * server so presets and day boundaries never depend on the browser's time zone.
 *
 * The Orders list uses it too (AJ, 2026-10-16) with `range` null for "every order": it keeps the page's other filters in
 * the address, shows `emptyLabel` until a range is applied, and offers Clear to go back to every order.
 */
export function DashboardRangePicker({ range, todayIso, emptyLabel, testId = "dashboard-range" }: { range: DateRange | null; todayIso: string; emptyLabel?: string; testId?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  // The draft inside the pop-up: `to` is null while the second day of a custom range is still to be picked.
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>(range ?? { from: null, to: null });
  const [custom, setCustom] = useState(false);
  const [view, setView] = useState(() => parse(range?.from ?? todayIso));

  const appliedPreset = range ? presetOf(range, todayIso) : null;
  const draftPreset = draft.from && draft.to ? presetOf({ from: draft.from, to: draft.to }, todayIso) : null;
  const tooLong = draft.from !== null && draft.to !== null && daysInRange({ from: draft.from, to: draft.to }) > MAX_RANGE_DAYS;
  const canApply = draft.from !== null && draft.to !== null && !tooLong;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(range ?? { from: null, to: null });
      setCustom(range !== null && appliedPreset === null);
      setView(parse(range?.from ?? todayIso));
    }
  }

  function choosePreset(key: PresetKey) {
    const r = presetRange(key, todayIso);
    setDraft(r);
    setCustom(false);
    setView(parse(r.from));
  }

  function chooseDay(iso: string) {
    setCustom(true);
    // A first click starts a range; a second on a later (or the same) day ends it; one on an earlier day starts over,
    // so the end can never be before the start.
    if (draft.from === null || draft.to !== null || iso < draft.from) setDraft({ from: iso, to: null });
    else setDraft({ from: draft.from, to: iso });
  }

  function apply() {
    if (!draft.from || !draft.to || tooLong) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", draft.from);
    params.set("to", draft.to);
    setOpen(false);
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    setOpen(false);
    startTransition(() => router.push(params.size > 0 ? `${pathname}?${params.toString()}` : pathname));
  }

  const year = view.getFullYear();
  const month = view.getMonth();
  const inDraft = (iso: string) => (draft.from === null ? false : draft.to ? iso >= draft.from && iso <= draft.to : iso === draft.from);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        type="button"
        data-testid={testId}
        aria-busy={pending}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {pending ? <LoaderCircle className="size-4 animate-spin text-primary" aria-hidden /> : <CalendarDays className="size-4 text-primary" aria-hidden />}
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          {range ? (
            <>
              {appliedPreset && <span className="text-muted-foreground">{PRESETS.find((p) => p.key === appliedPreset)?.label}:</span>}
              {!appliedPreset && <span className="text-muted-foreground">Custom Range:</span>}
              <span data-testid={`${testId}-text`}>{rangeText(range)}</span>
            </>
          ) : (
            <span data-testid={`${testId}-text`}>{emptyLabel ?? "All Dates"}</span>
          )}
        </span>
        {pending && <span className="sr-only" role="status">Updating the dashboard</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,34rem)] p-0" data-testid={`${testId}-popup`}>
        <div className="flex flex-col sm:flex-row">
          <div role="radiogroup" aria-label="Quick ranges" className="flex flex-wrap gap-1.5 border-b border-border p-3 sm:w-40 sm:flex-col sm:flex-nowrap sm:gap-0.5 sm:border-r sm:border-b-0">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                type="button"
                role="radio"
                aria-checked={!custom && draftPreset === preset.key}
                onClick={() => choosePreset(preset.key)}
                className={cn("rounded-md px-2.5 py-1.5 text-left text-sm", !custom && draftPreset === preset.key ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-muted")}
              >
                {preset.label}
              </button>
            ))}
            <button
              type="button"
              role="radio"
              aria-checked={custom}
              onClick={() => {
                setCustom(true);
                setDraft({ from: null, to: null });
              }}
              className={cn("rounded-md px-2.5 py-1.5 text-left text-sm", custom ? "bg-primary font-medium text-primary-foreground" : "text-foreground hover:bg-muted")}
            >
              Custom Range
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-3 p-3">
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setView(new Date(year, month - 1, 1))}>
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-sm font-semibold">{view.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setView(new Date(year, month + 1, 1))}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs" role="grid" aria-label="Pick the start and end day">
              {WEEKDAYS.map((d) => (
                <span key={d} className="py-1 text-muted-foreground">
                  {d}
                </span>
              ))}
              {monthCells(year, month).map((iso, i) =>
                iso === null ? (
                  <span key={`b${i}`} />
                ) : (
                  <button
                    key={iso}
                    type="button"
                    aria-label={show(iso)}
                    aria-pressed={iso === draft.from || iso === draft.to}
                    onClick={() => chooseDay(iso)}
                    className={cn(
                      "h-8 text-sm transition-colors",
                      iso === draft.from || iso === draft.to ? "rounded-md bg-primary font-semibold text-primary-foreground" : inDraft(iso) ? "bg-primary/15 text-foreground" : "rounded-md text-foreground hover:bg-muted",
                      iso === todayIso && !inDraft(iso) && "font-semibold text-primary",
                    )}
                  >
                    {Number(iso.slice(8))}
                  </button>
                ),
              )}
            </div>
            <p className="min-h-5 text-xs text-muted-foreground" role="status" data-testid={`${testId}-draft`}>
              {tooLong ? <span className="text-destructive">Please pick at most {MAX_RANGE_DAYS} days.</span> : draft.from && draft.to ? rangeText({ from: draft.from, to: draft.to }) : draft.from ? `Start ${show(draft.from)}. Now pick the end day.` : "Pick the start day."}
            </p>
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              {emptyLabel && range && (
                <Button type="button" variant="ghost" size="md" className="mr-auto" onClick={clear}>
                  Clear
                </Button>
              )}
              <Button type="button" variant="outline" size="md" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="button" size="md" disabled={!canApply} onClick={apply}>
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

