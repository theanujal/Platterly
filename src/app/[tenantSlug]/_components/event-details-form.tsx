"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Leaf, Drumstick, ArrowRight, CalendarDays, Users, UtensilsCrossed, PartyPopper, Check, MapPin, Layers, FileText, Files } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormCard, FormSection } from "@/components/public/form-section";
import { MARKETING_CONSENT_DEFAULT_CHECKED } from "@/modules/menu-approvals/storefront-draft-constants";
import { startDraftAction, saveDetailsAction } from "../actions";
import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { guestBreakdown } from "@/modules/menu-approvals/guest-summary";
import { earliestPublicEventDate, PUBLIC_MIN_LEAD_DAYS } from "@/modules/menu-approvals/public-lead-time";

const MEAL_TYPE_OPTIONS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "HITEA", label: "Hi-Tea" },
  { value: "DINNER", label: "Dinner" },
  { value: "OTHER", label: "Other" },
] as const;

interface FormValues {
  /** Single: one date and one meal. Multi: a date range, several meals, or both. Chosen before the event date; it switches by itself when a second meal is ticked or removed. An existing draft starts from its dates and meal count. */
  orderType?: "SINGLE" | "MULTI" | "";
  name: string;
  email: string;
  phone: string;
  eventTypeId: string;
  eventDate: string;
  /** Last day of a Multi Order; the same as `eventDate` for one day. */
  eventEndDate?: string;
  guestCount: string;
  childBelow5Count: string;
  child5To10Count: string;
  eventMealTypes: string[];
  menuPreference: string;
  venueLocation: string;
}

const EMPTY_VALUES: FormValues = {
  orderType: "",
  name: "",
  email: "",
  phone: "",
  eventTypeId: "",
  eventDate: "",
  eventEndDate: "",
  guestCount: "",
  childBelow5Count: "",
  child5To10Count: "",
  eventMealTypes: [],
  menuPreference: "",
  venueLocation: "",
};

interface EventDetailsFormProps {
  tenantSlug: string;
  businessName: string;
  eventTypes: { id: string; name: string; minGuests: number | null }[];
  /** Present when stepping back to edit an existing draft — contact fields are then read-only. */
  draft?: { id: string; values: FormValues };
  /** Set when the form sits in the Build Your Menu side panel: it saves, then calls this instead of moving to the next step. */
  onSaved?: () => void;
}

export type { FormValues as EventDetailsFormValues };

export function EventDetailsForm({ tenantSlug, businessName, eventTypes, draft, onSaved }: EventDetailsFormProps) {
  const inPanel = !!onSaved;
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(draft ? { ...draft.values, orderType: draft.values.eventMealTypes.length > 1 || (draft.values.eventEndDate ?? draft.values.eventDate) > draft.values.eventDate ? "MULTI" : "SINGLE" } : EMPTY_VALUES);
  const [consent, setConsent] = useState(MARKETING_CONSENT_DEFAULT_CHECKED);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // The Order Type popups, as in the kitchen's Create Order: a question before Single Order removes anything, and a "Got it" notice whenever the type changes.
  const [pendingSingle, setPendingSingle] = useState(false);
  const [typeNotice, setTypeNotice] = useState<"multiOn" | "multiOnMeals" | "multiOff" | "multiOffMeals" | null>(null);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const hasRange = !!values.eventEndDate && values.eventEndDate > values.eventDate;

  /** What Single Order would keep (the start date, the first meal) and what it would remove. */
  const singleLoss = { extraDates: hasRange ? 1 : 0, removedMeals: Math.max(values.eventMealTypes.length - 1, 0) };
  const singleLosesSomething = singleLoss.extraDates > 0 || singleLoss.removedMeals > 0;

  function applyOrderType(type: "SINGLE" | "MULTI") {
    setValues((prev) => ({
      ...prev,
      orderType: type,
      eventMealTypes: type === "SINGLE" ? prev.eventMealTypes.slice(0, 1) : prev.eventMealTypes,
      eventEndDate: type === "SINGLE" ? prev.eventDate : prev.eventEndDate || prev.eventDate,
    }));
    // The first choice is not a change, so it gets no popup.
    if (values.orderType) setTypeNotice(type === "MULTI" ? "multiOn" : "multiOff");
  }

  /** Single keeps one date (the start) and one meal (the first ticked), and asks first when that removes something; Multi allows several meals, a date range, or both. */
  function chooseOrderType(type: "SINGLE" | "MULTI") {
    if (type === values.orderType) return;
    if (type === "SINGLE" && singleLosesSomething) {
      setPendingSingle(true);
      return;
    }
    applyOrderType(type);
  }

  /** Ticking a second meal makes it a Multi Order; taking it back to one meal on one date makes it a Single Order again. */
  function toggleMeal(meal: string, selected: boolean) {
    const nextMeals = values.orderType === "SINGLE" && !selected && values.eventMealTypes.length === 0 ? [meal] : selected ? values.eventMealTypes.filter((m) => m !== meal) : [...values.eventMealTypes, meal];
    // Only taking a meal away can send it back to Single: ticking a first meal after choosing Multi keeps Multi.
    const nextType = nextMeals.length > 1 || hasRange ? "MULTI" : selected && values.orderType === "MULTI" ? "SINGLE" : values.orderType;
    setValues((prev) => ({ ...prev, eventMealTypes: nextMeals, orderType: nextType }));
    if (nextType !== values.orderType) setTypeNotice(nextType === "MULTI" ? "multiOnMeals" : "multiOffMeals");
  }

  function setStartDate(start: string) {
    setValues((prev) => ({ ...prev, eventDate: start, eventEndDate: prev.orderType === "MULTI" && prev.eventEndDate && prev.eventEndDate >= start ? prev.eventEndDate : start }));
  }

  const selectedEventType = eventTypes.find((et) => et.id === values.eventTypeId);
  const minGuests = selectedEventType?.minGuests ?? null;
  // 2 days' notice for customers (AJ, 2026-09-27): today and tomorrow are not selectable.
  const earliestDate = earliestPublicEventDate();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.orderType) {
      setError("Please choose an Order Type.");
      return;
    }
    if (!values.eventDate) {
      setError(values.orderType === "MULTI" ? "Please choose the event start date." : "Please choose an Event Date.");
      return;
    }
    if (values.orderType === "MULTI" && !values.eventEndDate) {
      setError("Please choose the event end date.");
      return;
    }
    if (!values.menuPreference) {
      setError("Please choose Vegetarian or Non-Vegetarian.");
      return;
    }
    if (values.eventMealTypes.length === 0) {
      setError("Please choose at least one meal.");
      return;
    }
    if (!values.venueLocation.trim()) {
      setError("Please enter the Venue Location.");
      return;
    }
    setPending(true);

    const formData = new FormData();
    Object.entries({ ...values, eventEndDate: values.orderType === "MULTI" ? values.eventEndDate || values.eventDate : values.eventDate }).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((v) => formData.append(key, v));
      else if (value !== "") formData.set(key, value);
    });

    if (draft) {
      const result = await saveDetailsAction(tenantSlug, draft.id, formData);
      setPending(false);
      if (!result.ok) return setError(result.error);
      if (onSaved) return onSaved();
      router.push(`/${tenantSlug}/plan/${draft.id}?step=menu`);
      return;
    }

    formData.set("marketingConsent", consent ? "true" : "false");
    try {
      const visitId = sessionStorage.getItem(`pv:${tenantSlug}`);
      if (visitId && visitId !== "none" && visitId !== "pending") formData.set("visitId", visitId);
    } catch {
      /* no visit to link */
    }
    const result = await startDraftAction(tenantSlug, formData);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.push(`/${tenantSlug}/plan/${result.draftId}?step=menu`);
  }

  // The server clears every meal's menu and dishes when either of these changes (add-ons are kept).
  const resetsPicks = !!draft && (values.eventTypeId !== draft.values.eventTypeId || values.menuPreference !== draft.values.menuPreference);

  // Shown once any kids are entered, so it is clear they are added on top of the adults.
  const adultsEntered = Number(values.guestCount) || 0;
  const kidsBelow5 = Number(values.childBelow5Count) || 0;
  const kids5To10 = Number(values.child5To10Count) || 0;
  const guestTotal = kidsBelow5 + kids5To10 > 0 ? guestBreakdown(adultsEntered, kidsBelow5, kids5To10) : null;

  const eventTypeItems = Object.fromEntries(eventTypes.map((et) => [et.id, et.name]));

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-6", inPanel && "p-4 pt-0")}>
      <FormCard className={inPanel ? "p-0 ring-0 md:p-0" : undefined}>
        <FormSection stacked={inPanel} icon={User} title="About You" description="Let us know how to reach you.">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-name" required>Your Name</Label>
            <IconInput icon={User} id="ed-name" required readOnly={!!draft} placeholder="Enter your full name" value={values.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
            <div className="flex flex-col gap-1.5 sm:col-span-3">
              <Label htmlFor="ed-email" required>Email Address</Label>
              <IconInput icon={Mail} id="ed-email" type="email" required readOnly={!!draft} placeholder="your.email@example.com" value={values.email} onChange={(e) => setField("email", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="ed-phone" required>Phone Number</Label>
              {draft ? (
                <Input id="ed-phone" readOnly value={values.phone} />
              ) : (
                <PhoneInput id="ed-phone" required value={values.phone} onChange={(v) => setField("phone", v)} />
              )}
            </div>
          </div>
        </FormSection>

        <FormSection stacked={inPanel} icon={Layers} title="Order Type" required description="Choose how many menus you need for this event.">
          <div role="radiogroup" aria-label="Order Type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <OrderTypeCard selected={values.orderType === "SINGLE"} onSelect={() => chooseOrderType("SINGLE")} icon={FileText} tone="orange" title="Single Order" subtitle="One menu for your event" />
            <OrderTypeCard selected={values.orderType === "MULTI"} onSelect={() => chooseOrderType("MULTI")} icon={Files} tone="red" title="Multi Order" subtitle="Different menus for different meals or groups" />
          </div>
        </FormSection>

        <FormSection stacked={inPanel} icon={CalendarDays} title="Your Event" description="Share the event details.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {values.orderType === "MULTI" ? (
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="ed-date" required>Event Dates</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Event start date</span>
                    <DateRangePicker id="ed-date" single ariaLabel="Event start date" startDate={values.eventDate} endDate={values.eventDate} onChange={(start) => setStartDate(start)} minDate={earliestDate} placeholder="Select start date" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted-foreground">Event end date</span>
                    <DateRangePicker
                      id="ed-end-date"
                      single
                      ariaLabel="Event end date"
                      startDate={values.eventEndDate || values.eventDate}
                      endDate={values.eventEndDate || values.eventDate}
                      onChange={(end) => setField("eventEndDate", end)}
                      minDate={values.eventDate || earliestDate}
                      placeholder="Select end date"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">We need at least {PUBLIC_MIN_LEAD_DAYS} days&apos; notice, so today and tomorrow can&apos;t be booked. Use the same day for several meals on one day.</p>
              </div>
            ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-date" required>Event Date</Label>
              {/* The date follows the Order Type, so it opens once one is chosen. */}
              <fieldset disabled={!values.orderType} className="m-0 min-w-0 border-0 p-0 disabled:opacity-60">
              <DateRangePicker
                id="ed-date"
                single
                startDate={values.eventDate}
                endDate={values.eventDate}
                onChange={(start) => setStartDate(start)}
                minDate={earliestDate}
                placeholder={values.orderType ? "Select event date" : "Choose an Order Type first"}
              />
              </fieldset>
              <p className="text-xs text-muted-foreground">We need at least {PUBLIC_MIN_LEAD_DAYS} days&apos; notice, so today and tomorrow can&apos;t be booked.</p>
            </div>
            )}
            <div className={cn("flex flex-col gap-1.5", values.orderType === "MULTI" && "sm:col-span-2")}>
              <Label htmlFor="ed-event-type" required>Event Type</Label>
              <Select items={eventTypeItems} value={values.eventTypeId} onValueChange={(v) => setField("eventTypeId", v ?? "")}>
                <SelectTrigger id="ed-event-type" className="w-full">
                  <PartyPopper className="text-muted-foreground" />
                  <SelectValue placeholder="Select event type" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((et) => (
                    <SelectItem key={et.id} value={et.id}>
                      {et.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-location" required>Venue Location</Label>
            <IconInput
              icon={MapPin}
              id="ed-location"
              required
              placeholder="Area, locality or address, e.g. Whitefield, Bangalore"
              value={values.venueLocation}
              onChange={(e) => setField("venueLocation", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">We use this to check we can serve your area. You&apos;ll share the full venue and delivery details after you approve your menu.</p>
          </div>
        </FormSection>

        <FormSection stacked={inPanel} icon={Users} title="Guests" description="Children are counted in addition to adults. Kids under 5 are usually free; kids 5–10 are charged a reduced rate. Your quote shows the exact amount.">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-guests" required>Number of Adults (11+ years)</Label>
            <IconInput
              icon={Users}
              id="ed-guests"
              type="number"
              min={minGuests ?? 1}
              required
              placeholder={minGuests ? `Minimum ${minGuests} adults` : "Number of adults"}
              value={values.guestCount}
              onChange={(e) => setField("guestCount", e.target.value)}
            />
            {/* Shown from the start: the minimum depends on the event type, so until one is chosen it says so. */}
            <p className="text-xs text-muted-foreground">{minGuests ? `Minimum ${minGuests} adults required. ` : "The minimum number of adults depends on your event type. "}Adults only. Add children separately below.</p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-kids-below-5">Number of Kids (0–5 Years)</Label>
              <IconInput icon={Users} id="ed-kids-below-5" type="number" min={0} placeholder="0" value={values.childBelow5Count} onChange={(e) => setField("childBelow5Count", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-kids-5-10">Number of Kids (5–10 Years)</Label>
              <IconInput icon={Users} id="ed-kids-5-10" type="number" min={0} placeholder="0" value={values.child5To10Count} onChange={(e) => setField("child5To10Count", e.target.value)} />
            </div>
          </div>
          {guestTotal && (
            <p className="text-sm font-medium" data-testid="guest-total" aria-live="polite">
              Total guests: {guestTotal.total} ({guestTotal.parts})
            </p>
          )}
        </FormSection>

        <FormSection stacked={inPanel} icon={UtensilsCrossed} title="Meals Required" required description="Choose every meal you need on each day. Pick more than one and this becomes a Multi Order; you will build a menu for each meal.">
          <div role="group" aria-label="Meals Required" className="flex flex-wrap gap-3">
            {MEAL_TYPE_OPTIONS.map((o) => {
              const selected = values.eventMealTypes.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => toggleMeal(o.value, selected)}
                  className={cn(
                    "flex h-10 items-center gap-2.5 rounded-lg border px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:border-foreground/30",
                  )}
                >
                  <span className={cn("flex size-5 items-center justify-center rounded-md border", selected ? "border-primary bg-primary text-primary-foreground" : "border-foreground/40")}>
                    {selected && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                  {o.label}
                </button>
              );
            })}
          </div>
        </FormSection>

        <FormSection stacked={inPanel} icon={Leaf} title="Menu Preference" required description="Choose your preferred menu type.">
          <div role="radiogroup" aria-label="Menu Preference" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <PreferenceCard
              selected={values.menuPreference === "VEGETARIAN"}
              onSelect={() => setField("menuPreference", "VEGETARIAN")}
              icon={<Leaf className="size-5 text-success" />}
              tone="success"
              title="Vegetarian"
              subtitle="Pure veg menu"
            />
            <PreferenceCard
              selected={values.menuPreference === "NON_VEGETARIAN"}
              onSelect={() => setField("menuPreference", "NON_VEGETARIAN")}
              icon={<Drumstick className="size-5 text-destructive" />}
              tone="danger"
              title="Non-Vegetarian"
              subtitle="Includes meat options"
            />
          </div>
        </FormSection>

        {!draft && (
          <div className="flex items-start gap-3 rounded-lg bg-muted/60 p-3">
            <Checkbox id="ed-consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5 border-foreground/40" />
            <Label htmlFor="ed-consent" className="cursor-pointer font-normal leading-5">
              Keep me posted about my event on WhatsApp and email — including occasional offers and menu ideas from {businessName}. You can opt out any time.
            </Label>
          </div>
        )}

      {resetsPicks && (
        <p role="status" className="rounded-lg bg-warning/10 p-3 text-sm" data-testid="picks-reset-warning">
          Changing the event type or menu preference clears the menu and dishes you chose for every meal, because the menus on offer can differ. Your add-ons are kept.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {/* The button ends the form, right under the last field (AJ, 2026-10-14): full width on a phone, at the right edge on a desktop. */}
      <div className={cn("flex", !inPanel && "border-t border-border pt-5 sm:justify-end")}>
        <Button type="submit" size="lg" disabled={pending} className={cn(inPanel || "w-full sm:w-auto")}>
          {inPanel ? (pending ? "Saving…" : "Save Changes") : pending ? "Saving…" : <span>Continue to Build Your Menu</span>}
          {!inPanel && <ArrowRight />}
        </Button>
      </div>
      </FormCard>

      <AlertDialog open={pendingSingle} onOpenChange={(open) => !open && setPendingSingle(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change this order to Single Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Single Order keeps one date and one meal. This removes{" "}
              {[singleLoss.extraDates > 0 ? "the date range (the start date is kept)" : "", singleLoss.removedMeals > 0 ? `${singleLoss.removedMeals} ${singleLoss.removedMeals === 1 ? "meal" : "meals"} (the first one is kept)` : ""].filter(Boolean).join(" and ")}. Cancel to keep everything as it is.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Multi Order</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                applyOrderType("SINGLE");
                setPendingSingle(false);
              }}
            >
              Switch and remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={typeNotice !== null} onOpenChange={(open) => !open && setTypeNotice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{typeNotice === "multiOff" || typeNotice === "multiOffMeals" ? "Order Type changed to Single Order" : "Order Type changed to Multi Order"}</AlertDialogTitle>
            <AlertDialogDescription>
              {typeNotice === "multiOn"
                ? "This is now a Multi Order. Pick a start and an end date (the same day for several meals on one day), and choose every meal you need. You will build a menu for each meal."
                : typeNotice === "multiOnMeals"
                  ? "You picked more than one meal, so this is now a Multi Order, even on a single day. You will build a menu for each meal."
                  : typeNotice === "multiOffMeals"
                    ? "Back to one meal on one date, so this is now a Single Order."
                    : "This is now a Single Order: one date and one meal."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setTypeNotice(null)}>Got it</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function OrderTypeCard({ selected, onSelect, icon: Icon, tone, title, subtitle }: { selected: boolean; onSelect: () => void; icon: LucideIcon; tone: "orange" | "red"; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "border-primary bg-accent/40" : "border-border bg-card hover:border-foreground/30",
      )}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-foreground/40")}>{selected && <span className="size-2.5 rounded-full bg-primary" />}</span>
      <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-lg", tone === "orange" ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive")}>
        <Icon className="size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}

function PreferenceCard({
  selected,
  onSelect,
  icon,
  tone,
  title,
  subtitle,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  tone: "success" | "danger";
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? (tone === "success" ? "border-success bg-success/10" : "border-destructive bg-destructive/10") : "border-border bg-card hover:border-foreground/30",
      )}
    >
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", tone === "success" ? "bg-success/10" : "bg-destructive/10")}>{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </span>
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          selected ? (tone === "success" ? "border-success bg-success text-white" : "border-destructive bg-destructive text-white") : "border-foreground/40",
        )}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}
