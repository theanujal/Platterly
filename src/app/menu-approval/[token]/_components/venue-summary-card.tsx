"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/public/form-section";
import type { VenueDetails } from "@/modules/menu-approvals/approval-link";
import { formatApprovalDay, type ApprovalView } from "@/modules/menu-approvals/approval-view";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";

/** An event day as a small date tile: month over day. */
function DateTile({ date }: { date: string }) {
  const month = new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDate();
  return (
    <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10 leading-tight text-primary">
      <span className="text-[11px] font-semibold uppercase">{month}</span>
      <span className="text-xl font-bold text-foreground">{day}</span>
    </span>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium whitespace-pre-line">{value}</dd>
    </div>
  );
}

/** One venue as two columns of fields, as in the Confirmation design: the place on the left, the address and contact on the right. */
function VenueBlock({ date, heading, venue }: { date: string; heading: string; venue: VenueDetails }) {
  const typeLabel = VENUE_TYPE_OPTIONS.find((o) => o.value === venue.venueType)?.label ?? null;
  const unit = [venue.venueDoorNumber, venue.venueTower, venue.venueFloor].filter(Boolean).join(", ");
  return (
    <div className="flex gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0" data-testid="venue-summary-day">
      <DateTile date={date} />
      <div className="min-w-0 flex-1">
        <h3 className="mb-3 text-[15px] font-semibold text-primary">{heading}</h3>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2" data-testid="venue-summary">
          <div className="flex flex-col gap-3">
            <Field label="Venue Type" value={typeLabel} />
            <Field label="Venue / Building Name" value={venue.venueBuildingName || null} />
            <Field label="Door / Tower / Floor" value={unit || null} />
            <Field label="Landmark" value={venue.venueLandmark || null} />
            <Field label="Gas / electric connection" value={venue.gasElectricAvailable ? "Yes" : "No"} />
          </div>
          <div className="flex flex-col gap-3">
            <Field label="Complete Venue Address" value={venue.completeVenueAddress || null} />
            <Field label="Contact Person" value={venue.venueContactName || null} />
            <Field label="Contact Number" value={venue.venueContactPhone || null} />
            <Field label="Cooking live counter facility" value={venue.liveCounterAvailable ? "Yes" : "No"} />
          </div>
          {(venue.venueAccessInstructions || venue.cookingInstructions) && (
            <div className="flex flex-col gap-3 sm:col-span-2">
              <Field label="Loading / Access Instructions" value={venue.venueAccessInstructions || null} />
              <Field label="Cooking Instructions" value={venue.cookingInstructions || null} />
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

/** "Day 2 · Lunch · 1 Nov 2026" (the day only when the order spans several days). */
function eventHeading(view: ApprovalView, key: string) {
  const event = view.events.find((e) => e.key === key);
  if (!event) return key;
  const many = new Set(view.events.map((e) => e.date)).size > 1;
  return `${many ? `Day ${event.dayNumber} · ` : ""}${event.mealLabel} · ${formatApprovalDay(event.date)}`;
}

/**
 * The customer's venue and delivery details on the Confirmation page. One venue for the whole order shows as one block; when the
 * venue differs by event, one event is shown at a time with previous / next arrows, as on the Venue & Delivery step.
 */
export function VenueSummaryCard({ view, venue, perEvent }: { view: ApprovalView; venue: VenueDetails; perEvent: { key: string; venue: VenueDetails }[] | null }) {
  const [index, setIndex] = useState(0);
  const blocks =
    perEvent && perEvent.length > 0
      ? perEvent.map((entry) => ({ key: entry.key, date: view.events.find((e) => e.key === entry.key)?.date ?? view.events[0]?.date ?? "", heading: eventHeading(view, entry.key), venue: entry.venue }))
      : [{ key: "all", date: view.events[0]?.date ?? "", heading: view.events.length > 1 ? "All events" : (view.events[0] ? eventHeading(view, view.events[0].key) : "Venue"), venue }];
  const current = blocks[Math.min(index, blocks.length - 1)];
  return (
    <FormCard className="gap-5 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MapPin className="size-5" />
        </span>
        <h2 className="min-w-0 flex-1 text-lg font-semibold">Your Venue &amp; Delivery Details</h2>
        {blocks.length > 1 && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-sm text-muted-foreground" data-testid="venue-position">
              {index + 1} of {blocks.length}
            </span>
            <Button type="button" variant="outline" size="icon" aria-label="Previous event" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              <ChevronLeft />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="Next event" disabled={index === blocks.length - 1} onClick={() => setIndex(index + 1)}>
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>
      <VenueBlock key={current.key} date={current.date} heading={current.heading} venue={current.venue} />
    </FormCard>
  );
}
