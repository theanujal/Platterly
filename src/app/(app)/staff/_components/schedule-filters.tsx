"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { SCHEDULE_RANGES as RANGE_OPTIONS } from "@/modules/employees/duty";

const RANGE_LABEL: Record<string, string> = Object.fromEntries(RANGE_OPTIONS.map((d) => [String(d), `Next ${d} days`]));

/** Search and date window for the upcoming-events list. Both live in the URL so the list stays a server page; a change returns to page 1. */
export function ScheduleFilters({ days, q }: { days: number; q: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(q);

  function go(next: { days?: number; q?: string }) {
    const params = new URLSearchParams();
    const d = next.days ?? days;
    const query = (next.q ?? text).trim();
    if (d !== RANGE_OPTIONS[0]) params.set("days", String(d));
    if (query) params.set("q", query);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          aria-label="Search events"
          placeholder="Search event, order ID or customer…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go({ q: e.currentTarget.value })}
          onBlur={() => text.trim() !== q && go({})}
          className="h-10 w-full min-w-64 rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-80"
        />
      </div>
      <Select items={RANGE_LABEL} value={String(days)} onValueChange={(v) => go({ days: Number(v) })}>
        <SelectTrigger aria-label="Date range" className="w-44">
          <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((d) => (
            <SelectItem key={d} value={String(d)}>
              {RANGE_LABEL[String(d)]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
