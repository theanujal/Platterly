"use client";

import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SummaryCard } from "@/app/(app)/orders/_components/order-form-parts";

/** What the Event Overview card shows; the order page builds it from the order it already loaded (the same values as the Order Summary). */
export interface EventOverviewData {
  orderType: string;
  eventType: string | null;
  /** The date, or "6 Nov 2026 – 8 Nov 2026" for a multi-day order. */
  eventDate: string;
  guests: { total: number; adults: number; below5: number; from5to10: number };
  venue: string | null;
}

/** "Event Overview": the few order facts the menu depends on, with "View Details" to the Order Details tab. */
export function ApprovalEventOverviewCard({ overview, onViewDetails }: { overview: EventOverviewData; onViewDetails: () => void }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Order Type", value: overview.orderType },
    { label: "Event Type", value: overview.eventType ?? "Not set" },
    { label: "Event Date", value: overview.eventDate },
    {
      label: "Guests",
      value: (
        <span className="flex flex-col items-end">
          <span>{overview.guests.total}</span>
          <span className="text-xs font-normal text-muted-foreground">
            ({overview.guests.adults} Adults, {overview.guests.below5} Children &lt;5, {overview.guests.from5to10} Children 5–10)
          </span>
        </span>
      ),
    },
    { label: "Venue", value: <span className="break-words">{overview.venue || "Not set"}</span> },
  ];
  return (
    <SummaryCard
      icon={CalendarDays}
      title="Event Overview"
      action={
        <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={onViewDetails}>
          View Details
        </Button>
      }
    >
      <dl className="flex flex-col gap-2.5 text-sm" data-testid="event-overview-card">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <dt className="shrink-0 text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-right font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>
    </SummaryCard>
  );
}
