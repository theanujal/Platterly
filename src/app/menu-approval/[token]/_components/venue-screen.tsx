"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, CircleCheck, Copy, MapPin, MessageSquareText, Phone, Truck, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormCard, FormSection } from "@/components/public/form-section";
import { cn } from "cn";
import type { VenueDetails, VenueSubmission } from "@/modules/menu-approvals/approval-link";
import { formatApprovalDay, type ApprovalView } from "@/modules/menu-approvals/approval-view";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";
import { askAboutApprovedMenuAction, confirmApprovalAction, submitVenueAction } from "../actions";
import { ApprovedMenuCard, guestDetail } from "./approved-menu-card";
import { PaymentDialog } from "./payment-dialog";
import { OrderNumberRow } from "./order-number-row";
import { PriceSummary } from "./price-summary";

const venueTypeItems = Object.fromEntries(VENUE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

/**
 * VENUE stage of the approval link: the menu is approved, now the customer says where and how to deliver. The
 * address starts with the Venue Location they gave at the beginning. Required: venue type, venue / building name,
 * complete address, contact person and number; the rest is optional.
 */
/** What the pop-up after the venue details needs; null when the kitchen cannot take online payment (nothing to show). */
export interface VenuePayment {
  advance: number;
  balance: number;
  advancePercent: number;
  orderNumber: string | null;
}

type VenueValues = Omit<VenueDetails, "venueType"> & { venueType: string };

const toValues = (venue: VenueDetails): VenueValues => ({ ...venue, venueType: venue.venueType ?? "" });

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The first required field an event's venue is still missing, or null when it can be sent. */
function missingField(values: VenueValues): string | null {
  if (!values.venueType) return "Venue Type";
  if (!values.venueBuildingName.trim()) return "Venue / Building Name";
  if (!values.completeVenueAddress.trim()) return "Complete Venue Address";
  if (!values.venueContactName.trim()) return "Contact Person";
  if (!values.venueContactPhone) return "Contact Number";
  return null;
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

/** The four Venue & Delivery sections for one venue. `prefix` keeps the ids unique when it is one event's form. */
function VenueFields({ values, set, prefix, stacked, bare }: { values: VenueValues; set: <K extends keyof VenueValues>(key: K, value: VenueValues[K]) => void; prefix: string; stacked?: boolean; bare?: boolean }) {
  const id = (name: string) => `${prefix}-${name}`;
  const Wrapper = bare ? Fragment : FormCard;
  return (
    <Wrapper>
      <FormSection stacked={stacked} icon={Building2} title="Venue Details" description="Help us find the event location and set up everything smoothly.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("type")} required>Venue Type</Label>
            <Select items={venueTypeItems} value={values.venueType} onValueChange={(v) => set("venueType", v ?? "")}>
              <SelectTrigger id={id("type")} className="w-full">
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
            <Label htmlFor={id("building")} required>Venue / Building Name</Label>
            <IconInput icon={Building2} id={id("building")} required placeholder="Enter venue / building name" value={values.venueBuildingName} onChange={(e) => set("venueBuildingName", e.target.value)} />
          </div>
        </div>
      </FormSection>

      <FormSection stacked={stacked} icon={MapPin} title="Address" description="Where exactly should we come?">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("door")}>Door / Flat / House No.</Label>
            <Input id={id("door")} placeholder="e.g. B-1204" value={values.venueDoorNumber} onChange={(e) => set("venueDoorNumber", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("tower")}>Tower / Block</Label>
            <Input id={id("tower")} placeholder="e.g. Tower B" value={values.venueTower} onChange={(e) => set("venueTower", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("floor")}>Floor</Label>
            <Input id={id("floor")} placeholder="e.g. 12th Floor" value={values.venueFloor} onChange={(e) => set("venueFloor", e.target.value)} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("address")} required>Complete Venue Address</Label>
          <Textarea id={id("address")} required placeholder="Enter complete venue address" value={values.completeVenueAddress} onChange={(e) => set("completeVenueAddress", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("landmark")}>Landmark (Optional)</Label>
          <IconInput icon={MapPin} id={id("landmark")} placeholder="e.g. Near Varthur Lake" value={values.venueLandmark} onChange={(e) => set("venueLandmark", e.target.value)} />
        </div>
      </FormSection>

      <FormSection stacked={stacked} icon={Phone} title="Venue Contact" description="Someone we can call on the day.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("contact-name")} required>Contact Person</Label>
            <IconInput icon={User} id={id("contact-name")} required placeholder="Enter contact person name" value={values.venueContactName} onChange={(e) => set("venueContactName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id("contact-phone")} required>Contact Number</Label>
            <PhoneInput id={id("contact-phone")} value={values.venueContactPhone} onChange={(v) => set("venueContactPhone", v)} />
          </div>
        </div>
      </FormSection>

      <FormSection stacked={stacked} icon={Truck} title="Access & Logistics" description="How our team reaches you and what to expect on site.">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("access")}>Loading / Access Instructions (Optional)</Label>
          <Textarea id={id("access")} placeholder="Enter loading / access instructions" value={values.venueAccessInstructions} onChange={(e) => set("venueAccessInstructions", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={id("cooking")}>Cooking Instructions (Optional)</Label>
          <Textarea id={id("cooking")} placeholder="e.g. Jain food to be cooked separately, or no onion and garlic" value={values.cookingInstructions} onChange={(e) => set("cookingInstructions", e.target.value)} />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
          <Checkbox id={id("gas-electric")} className="border-foreground/40" checked={values.gasElectricAvailable} onCheckedChange={(c) => set("gasElectricAvailable", c === true)} />
          <Label htmlFor={id("gas-electric")} className="cursor-pointer font-normal">
            Gas / electric connection available at venue?
          </Label>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
          <Checkbox id={id("live-counter")} className="border-foreground/40" checked={values.liveCounterAvailable} onCheckedChange={(c) => set("liveCounterAvailable", c === true)} />
          <Label htmlFor={id("live-counter")} className="cursor-pointer font-normal">
            Cooking live counter facility available?
          </Label>
        </div>
      </FormSection>
    </Wrapper>
  );
}

export function VenueScreen({
  token,
  view,
  initial,
  initialPerEvent = false,
  initialEventVenues = [],
  onBack,
  payment = null,
  orderNumber = null,
}: {
  token: string;
  view: ApprovalView;
  initial: VenueDetails;
  /** The customer already said the venue differs by event, and what they gave for each day. */
  initialPerEvent?: boolean;
  initialEventVenues?: { key: string; venue: VenueDetails }[];
  onBack?: () => void;
  payment?: VenuePayment | null;
  orderNumber?: string | null;
}) {
  const router = useRouter();
  const days = view.events;
  const manyDates = new Set(days.map((day) => day.date)).size > 1;
  const canDiffer = days.length > 1;
  const [values, setValues] = useState<VenueValues>(toValues(initial));
  // Every event day gets its own form once the customer says the venue differs; a day not filled in before starts as a copy of the main one.
  const [sameForAll, setSameForAll] = useState(!(canDiffer && initialPerEvent));
  const [perDay, setPerDay] = useState<Record<string, VenueValues>>(() => Object.fromEntries(days.map((day) => [day.key, toValues(initialEventVenues.find((entry) => entry.key === day.key)?.venue ?? initial)])));
  const [activeIndex, setActiveIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const perEvent = canDiffer && !sameForAll;
  const activeDay = days[Math.min(activeIndex, days.length - 1)];

  // Past the payment pop-up (Not now, or paid): only now is the menu approved and the order confirmed, then the confirmation shows.
  async function finish() {
    setPending(true);
    const result = await confirmApprovalAction(token);
    setPending(false);
    if (!result.ok) {
      setPayOpen(false);
      return setError(result.error);
    }
    router.refresh();
  }

  const set = <K extends keyof VenueValues>(key: K, value: VenueValues[K]) => setValues((prev) => ({ ...prev, [key]: value }));
  const setDay = <K extends keyof VenueValues>(key: K, value: VenueValues[K]) => setPerDay((prev) => ({ ...prev, [activeDay.key]: { ...prev[activeDay.key], [key]: value } }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    let submission: VenueSubmission;
    if (perEvent) {
      const firstMissing = days.findIndex((day) => missingField(perDay[day.key]) !== null);
      if (firstMissing >= 0) {
        setActiveIndex(firstMissing);
        return setError(`Event ${firstMissing + 1}: ${missingField(perDay[days[firstMissing].key])} is required.`);
      }
      submission = { perEvent: true, events: days.map((day) => ({ key: day.key, details: perDay[day.key] })) };
    } else {
      if (!values.venueType) return setError("Venue Type is required.");
      if (!values.venueContactPhone) return setError("Contact Number is required.");
      submission = values;
    }
    setPending(true);
    // With the payment pop-up in between, the details are only saved now; the approval is recorded when the customer gets past it.
    const result = await submitVenueAction(token, submission, !payment);
    if (!result.ok) {
      setPending(false);
      return setError(result.error);
    }
    // The same link now shows the Confirmation, after the payment pop-up when the kitchen takes payments (AJ, 2026-10-14).
    if (payment) {
      setPending(false);
      setPayOpen(true);
      return;
    }
    router.refresh();
  }

  const actions = (layout: "stack" | "row") => (
    <div className={cn("flex gap-2", layout === "stack" ? "flex-col" : "flex-row-reverse justify-start")}>
      <Button type="submit" form="venue-form" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Continue"}
        <ArrowRight />
      </Button>
      {onBack && (
        <Button type="button" size="lg" variant="outline" disabled={pending} onClick={onBack}>
          Back
        </Button>
      )}
    </div>
  );

  const locations = new Set(days.map((day) => perDay[day.key].completeVenueAddress.trim().toLowerCase()).filter(Boolean)).size;
  const eventTitle = (day: (typeof days)[number]) => (manyDates ? `Day ${day.dayNumber} · ${day.mealLabel}` : day.mealLabel);
  // A filled-in event's venue as the event list shows it: the building name, then the address.
  const eventPlace = (key: string) => {
    const v = perDay[key];
    const name = v.venueBuildingName.trim();
    return name ? { name, address: v.completeVenueAddress.trim().replace(/\s*\n\s*/g, ", ") } : null;
  };

  const banner = (
    <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
      <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
      <div className="text-sm">
        <p className="font-semibold">{onBack ? "Menu ready to approve" : "Menu Approved"}</p>
        <p className="text-muted-foreground">
          {onBack
            ? "Please share your venue and delivery details. Your menu approval is confirmed when you send them."
            : "Great! Your menu has been approved. Please share your venue and delivery details to help us plan the event."}
        </p>
      </div>
    </div>
  );

  const sameQuestion = canDiffer && (
    <FormCard className="gap-3 md:p-5" data-testid="venue-same-question">
      <div>
        <h2 className="text-[15px] font-semibold">Is the venue and delivery the same for all {days.length} events?</h2>
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
            onClick={() => {
              setSameForAll(option.value);
              setError(null);
            }}
            className={cn("flex flex-col rounded-lg border p-3 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50", sameForAll === option.value ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50")}
          >
            <span className="font-semibold">{option.title}</span>
            <span className="text-muted-foreground">{option.hint}</span>
          </button>
        ))}
      </div>
    </FormCard>
  );

  const priceSummary = (
    <PriceSummary rows={view.priceRows} total={view.total}>
      {!perEvent && error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </PriceSummary>
  );

  // On a phone only the actions stay on screen, as on Review & Approve.
  const phoneActions = <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden [&>div]:flex-row-reverse [&_button]:flex-1">{actions("row")}</div>;

  if (!perEvent) {
    return (
      <div className="flex flex-col gap-6">
        {payment && <PaymentDialog open={payOpen} onDone={finish} token={token} {...payment} />}
        {banner}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <form id="venue-form" onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
            {sameQuestion}
            <VenueFields prefix="vd" values={values} set={set} />
          </form>

          {/* Right: the same column as Review & Approve: the approved menu, the final price and the actions. */}
          <div className="flex flex-col gap-4 lg:sticky lg:top-4">
            <ApprovedMenuCard view={view} orderNumber={orderNumber} />
            {!onBack && <ChangesCard token={token} />}
            {priceSummary}
            <div className="max-lg:hidden">{actions("stack")}</div>
          </div>
        </div>
        {phoneActions}
      </div>
    );
  }

  // A venue for every event: the events and the Price Summary on the left, the chosen event's header and venue form in one card on the right.
  return (
    <div className="flex flex-col gap-6">
      {payment && <PaymentDialog open={payOpen} onDone={finish} token={token} {...payment} />}
      {banner}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 max-lg:contents lg:sticky lg:top-4">
          <FormCard className="gap-4 p-4 max-lg:order-1 md:p-4" data-testid="event-list">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-lg font-semibold">Order Type</p>
                <Badge variant="info">Multi-order</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {days.length} events · {locations} location{locations === 1 ? "" : "s"}
              </p>
              <div className="mt-2">
                <OrderNumberRow orderNumber={orderNumber} />
              </div>
            </div>
            <nav aria-label="Events" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {days.map((day, index) => {
                const place = eventPlace(day.key);
                const active = index === activeIndex;
                return (
                  <button
                    key={day.key}
                    type="button"
                    aria-current={active}
                    onClick={() => setActiveIndex(index)}
                    className={cn(
                      "flex min-w-64 items-start gap-3 rounded-xl border bg-card p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:min-w-0",
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                    )}
                  >
                    <DateTile date={day.date} active={active} />
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold">{eventTitle(day)}</span>
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
          </FormCard>
          <div className="flex flex-col gap-4 max-lg:order-3">
            {priceSummary}
            {!onBack && <ChangesCard token={token} />}
          </div>
        </div>

        <form id="venue-form" onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4 max-lg:order-2">
          {sameQuestion}
          <FormCard>
            <div className="flex flex-col gap-3" data-testid="event-header">
              <div className="flex items-center gap-3">
                <DateTile date={activeDay.date} active />
                <h2 className="min-w-0 flex-1 text-lg font-semibold">{eventTitle(activeDay)}</h2>
                <div className="flex shrink-0 items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button type="button" variant="outline" size="md" />}>
                      <Copy />
                      <span className="max-sm:sr-only">Copy from another event</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {days.map((day) =>
                        day.key === activeDay.key ? null : (
                          <DropdownMenuItem key={day.key} onClick={() => setPerDay((prev) => ({ ...prev, [activeDay.key]: { ...prev[day.key] } }))}>
                            {eventTitle(day)} · {formatApprovalDay(day.date)}
                          </DropdownMenuItem>
                        ),
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button type="button" variant="outline" size="icon" aria-label="Previous event" disabled={activeIndex === 0} onClick={() => setActiveIndex(activeIndex - 1)}>
                    <ChevronLeft />
                  </Button>
                  <Button type="button" variant="outline" size="icon" aria-label="Next event" disabled={activeIndex === days.length - 1} onClick={() => setActiveIndex(activeIndex + 1)}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-start gap-x-10 gap-y-3 text-sm">
                {view.guests !== null && (
                  <div>
                    <p className="font-semibold">{view.guests} Guests</p>
                    {guestDetail(view) && <p className="text-muted-foreground">{guestDetail(view)}</p>}
                  </div>
                )}
                {activeDay.menus.map((menu) => (
                  <div key={menu.name}>
                    <p className="font-semibold">{menu.name}</p>
                    {menu.pricePerPlate != null && <p className="text-muted-foreground">{inr(menu.pricePerPlate)} / plate</p>}
                  </div>
                ))}
              </div>
            </div>
            <VenueFields bare stacked key={activeDay.key} prefix={`vd-${activeDay.key}`} values={perDay[activeDay.key]} set={setDay} />
          </FormCard>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end max-lg:hidden">{actions("row")}</div>
        </form>
      </div>
      {phoneActions}
    </div>
  );
}

/** "Need to make changes?": leaves a note for the team about the approved menu (nothing is reopened automatically). */
export function ChangesCard({ token, children, canRequest = true }: { token: string; children?: React.ReactNode; canRequest?: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function send() {
    setPending(true);
    setError(null);
    const result = await askAboutApprovedMenuAction(token, note);
    setPending(false);
    if (!result.ok) return setError(result.error);
    setSent(true);
    setOpen(false);
    setNote("");
  }

  return (
    <FormCard className="gap-3 md:p-5">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageSquareText className="size-5" />
        </span>
        <h2 className="text-[15px] font-semibold">Need to make changes?</h2>
      </div>
      <p className="text-sm text-muted-foreground">{canRequest ? "If you want to change the approved menu, please contact our team. You can also send us a note here." : "If you want to change the approved menu, please contact our team."}</p>
      {sent && (
        <p role="status" className="text-sm font-medium text-success">
          Thanks, we&apos;ve passed your note to our team.
        </p>
      )}
      {!canRequest ? null : open ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="after-note">What would you like to change?</Label>
          <Textarea id="after-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Replace Paneer Tikka with Malai Tikka" />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="md" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="md" disabled={pending || note.trim() === ""} onClick={send}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="md" className="w-full" onClick={() => { setOpen(true); setSent(false); }}>
          Request Menu Changes
        </Button>
      )}
      {children}
    </FormCard>
  );
}
