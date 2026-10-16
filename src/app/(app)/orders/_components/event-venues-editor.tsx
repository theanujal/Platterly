"use client";

import { ChevronLeft, ChevronRight, Copy, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconInput } from "@/components/ui/icon-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";
import type { VenueDetailsInput } from "@/modules/orders/event-venues";
import { cn } from "cn";

/**
 * One venue per event on Order Details: the same design as the customer's Venue & Delivery step (a list of the events on the
 * left, the chosen event's venue on the right, "Copy from another event"). An event is a meal slot: a day and a meal.
 */
export interface EventVenueValues {
  venueType: string;
  venue: string;
  venueDoorNumber: string;
  venueTower: string;
  venueFloor: string;
  eventAddress: string;
  venueLandmark: string;
  venueContactName: string;
  venueContactPhone: string;
  venueAccessInstructions: string;
  cookingInstructions: string;
  gasElectricAvailable: boolean;
  liveCounterAvailable: boolean;
}

export const EMPTY_EVENT_VENUE: EventVenueValues = {
  venueType: "",
  venue: "",
  venueDoorNumber: "",
  venueTower: "",
  venueFloor: "",
  eventAddress: "",
  venueLandmark: "",
  venueContactName: "",
  venueContactPhone: "",
  venueAccessInstructions: "",
  cookingInstructions: "",
  gasElectricAvailable: false,
  liveCounterAvailable: false,
};

/** The event key the server and the customer's page use: "YYYY-MM-DD-MEALTYPE". */
export const eventSlotKey = (date: string, mealType: string) => `${date}-${mealType}`;

export interface EventSlot {
  key: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "Day 2 · Dinner", or just "Dinner" when every event is on one day. */
  title: string;
  menuName: string;
}

/** The first required field an event's venue is still missing, or null when it can be saved (the same ones the customer must give). */
export function missingEventVenueField(venue: EventVenueValues): string | null {
  if (!venue.venueType) return "Venue Type";
  if (!venue.venue.trim()) return "Venue / Building Name";
  if (!venue.eventAddress.trim()) return "Complete Venue Address";
  if (!venue.venueContactName.trim()) return "Venue Contact Person";
  if (!venue.venueContactPhone) return "Contact Number";
  return null;
}

/** The form's names for the server's (the customer's form names, which the server reads). */
export function eventVenueToInput(venue: EventVenueValues): VenueDetailsInput {
  return {
    venueType: venue.venueType,
    venueBuildingName: venue.venue,
    venueDoorNumber: venue.venueDoorNumber,
    venueTower: venue.venueTower,
    venueFloor: venue.venueFloor,
    completeVenueAddress: venue.eventAddress,
    venueLandmark: venue.venueLandmark,
    venueContactName: venue.venueContactName,
    venueContactPhone: venue.venueContactPhone,
    venueAccessInstructions: venue.venueAccessInstructions,
    cookingInstructions: venue.cookingInstructions,
    gasElectricAvailable: venue.gasElectricAvailable,
    liveCounterAvailable: venue.liveCounterAvailable,
  };
}

/** An event day as a small date tile: month over day. */
function DateTile({ date, active }: { date: string; active?: boolean }) {
  const month = new Date(`${date}T00:00:00.000Z`).toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" });
  const day = new Date(`${date}T00:00:00.000Z`).getUTCDate();
  return (
    <span className={cn("flex size-12 shrink-0 flex-col items-center justify-center rounded-lg leading-tight", active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
      <span className="text-[11px] font-semibold uppercase">{month}</span>
      <span className="text-lg font-bold text-foreground">{day}</span>
    </span>
  );
}

/** The place an event's venue reads as in the list: the building name, then the address; null while nothing is entered. */
export function eventPlace(venue: EventVenueValues | undefined): { name: string; address: string } | null {
  const name = venue?.venue.trim();
  return name ? { name, address: venue!.eventAddress.trim().replace(/\s*\n\s*/g, ", ") } : null;
}

/** "Is the venue the same for all N events?": the question that opens the per-event view. */
export function SameVenueQuestion({ events, sameForAll, onChange }: { events: number; sameForAll: boolean; onChange: (sameForAll: boolean) => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4 sm:col-span-2" data-testid="venue-same-question">
      <div>
        <h3 className="text-base font-semibold">Is the venue and delivery the same for all {events} events?</h3>
        <p className="text-sm text-muted-foreground">Choose No if some events are at a different place, contact or delivery address.</p>
      </div>
      <div role="radiogroup" aria-label="Venue for all events" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {[
          { value: true, title: "Yes, the same for all events", hint: "One venue and delivery address" },
          { value: false, title: "No, it is different for each event", hint: "Add a venue for every event" },
        ].map((option) => (
          <button
            key={String(option.value)}
            type="button"
            role="radio"
            aria-checked={sameForAll === option.value}
            onClick={() => onChange(option.value)}
            className={cn("flex flex-col rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", sameForAll === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
          >
            <span className="font-semibold">{option.title}</span>
            <span className="text-muted-foreground">{option.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EventVenuesEditor({
  slots,
  venues,
  activeKey,
  onActiveKey,
  onChange,
  onCopy,
}: {
  slots: EventSlot[];
  venues: Record<string, EventVenueValues>;
  activeKey: string;
  onActiveKey: (key: string) => void;
  onChange: <K extends keyof EventVenueValues>(key: string, field: K, value: EventVenueValues[K]) => void;
  onCopy: (fromKey: string, toKey: string) => void;
}) {
  const activeIndex = Math.max(0, slots.findIndex((slot) => slot.key === activeKey));
  const active = slots[activeIndex];
  const venue = venues[active.key] ?? EMPTY_EVENT_VENUE;
  const locations = new Set(slots.map((slot) => venues[slot.key]?.eventAddress.trim().toLowerCase()).filter(Boolean)).size;
  const set = <K extends keyof EventVenueValues>(field: K, value: EventVenueValues[K]) => onChange(active.key, field, value);
  const id = (name: string) => `event-venue-${active.key}-${name}`;

  return (
    <div className="grid grid-cols-1 items-start gap-4 sm:col-span-2 lg:grid-cols-[18rem_minmax(0,1fr)]" data-testid="event-venues">
      <div className="flex flex-col gap-3" data-testid="event-list">
        <p className="text-sm text-muted-foreground">
          {slots.length} events · {locations} location{locations === 1 ? "" : "s"}
        </p>
        <nav aria-label="Events" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {slots.map((slot) => {
            const place = eventPlace(venues[slot.key]);
            const isActive = slot.key === active.key;
            return (
              <button
                key={slot.key}
                type="button"
                aria-current={isActive}
                onClick={() => onActiveKey(slot.key)}
                className={cn("flex min-w-64 items-start gap-3 rounded-xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-w-0", isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
              >
                <DateTile date={slot.date} active={isActive} />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="block font-semibold">{slot.title}</span>
                  <span className={cn("mt-1 flex items-start gap-1.5 text-xs", place ? "text-muted-foreground" : "text-warning")}>
                    <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {place ? (
                      <span className="line-clamp-2">
                        {place.name}
                        {place.address && `, ${place.address}`}
                      </span>
                    ) : (
                      <span>Venue details pending</span>
                    )}
                  </span>
                </span>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-lg border border-border p-4">
        <div className="flex flex-col gap-3" data-testid="event-header">
          <div className="flex items-center gap-3">
            <DateTile date={active.date} active />
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold">{active.title}</h3>
              {active.menuName && <p className="text-sm text-muted-foreground">{active.menuName}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button type="button" variant="outline" size="md" />}>
                  <Copy />
                  <span className="max-sm:sr-only">Copy from another event</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {slots.map((slot) =>
                    slot.key === active.key ? null : (
                      <DropdownMenuItem key={slot.key} onClick={() => onCopy(slot.key, active.key)}>
                        {slot.title}
                      </DropdownMenuItem>
                    ),
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button type="button" variant="outline" size="icon" aria-label="Previous event" disabled={activeIndex === 0} onClick={() => onActiveKey(slots[activeIndex - 1].key)}>
                <ChevronLeft />
              </Button>
              <Button type="button" variant="outline" size="icon" aria-label="Next event" disabled={activeIndex === slots.length - 1} onClick={() => onActiveKey(slots[activeIndex + 1].key)}>
                <ChevronRight />
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("type")}>Venue Type</Label>
            <Select items={Object.fromEntries(VENUE_TYPE_OPTIONS.map((o) => [o.value, o.label]))} value={venue.venueType} onValueChange={(v) => set("venueType", v ?? "")}>
              <SelectTrigger id={id("type")} className="w-full" aria-label="Venue Type">
                <SelectValue placeholder="Select venue type" />
              </SelectTrigger>
              <SelectContent>
                {VENUE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("building")}>Venue / Building Name</Label>
            <IconInput icon={MapPin} id={id("building")} value={venue.venue} onChange={(e) => set("venue", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={id("address")}>Complete Venue Address</Label>
            <Textarea id={id("address")} value={venue.eventAddress} onChange={(e) => set("eventAddress", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("door")}>Door / Flat / House No.</Label>
              <Input id={id("door")} value={venue.venueDoorNumber} onChange={(e) => set("venueDoorNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("tower")}>Tower / Block</Label>
              <Input id={id("tower")} value={venue.venueTower} onChange={(e) => set("venueTower", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={id("floor")}>Floor</Label>
              <Input id={id("floor")} value={venue.venueFloor} onChange={(e) => set("venueFloor", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("landmark")}>Landmark</Label>
            <Input id={id("landmark")} value={venue.venueLandmark} onChange={(e) => set("venueLandmark", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("contact-name")}>Venue Contact Person</Label>
            <Input id={id("contact-name")} value={venue.venueContactName} onChange={(e) => set("venueContactName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={id("contact-phone")}>Contact Number</Label>
            <PhoneInput id={id("contact-phone")} value={venue.venueContactPhone} onChange={(v) => set("venueContactPhone", v)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("access")}>Catering Access / Loading Instructions</Label>
            <Textarea id={id("access")} value={venue.venueAccessInstructions} onChange={(e) => set("venueAccessInstructions", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("cooking")}>Cooking Instructions</Label>
            <Textarea id={id("cooking")} value={venue.cookingInstructions} onChange={(e) => set("cookingInstructions", e.target.value)} />
          </div>
          <label htmlFor={id("live-counter")} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3">
            <Checkbox id={id("live-counter")} checked={venue.liveCounterAvailable} onCheckedChange={(checked) => set("liveCounterAvailable", checked === true)} />
            <span className="text-sm font-medium">Cooking / live counter facility available?</span>
          </label>
          <label htmlFor={id("gas-electric")} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-3">
            <Checkbox id={id("gas-electric")} checked={venue.gasElectricAvailable} onCheckedChange={(checked) => set("gasElectricAvailable", checked === true)} />
            <span className="text-sm font-medium">Gas / electric connection available at venue?</span>
          </label>
        </div>
      </div>
    </div>
  );
}
