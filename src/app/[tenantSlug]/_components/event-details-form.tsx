"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Leaf, Drumstick, ArrowRight, CalendarDays, Users, UtensilsCrossed, PartyPopper, Check, MapPin } from "lucide-react";
import { StepFooter } from "@/components/public/step-footer";
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
import { earliestPublicEventDate, PUBLIC_MIN_LEAD_DAYS } from "@/modules/menu-approvals/public-lead-time";

const MEAL_TYPE_OPTIONS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "HITEA", label: "Hi-Tea" },
  { value: "DINNER", label: "Dinner" },
  { value: "OTHER", label: "Other" },
] as const;

interface FormValues {
  name: string;
  email: string;
  phone: string;
  eventTypeId: string;
  eventDate: string;
  guestCount: string;
  childBelow5Count: string;
  child5To10Count: string;
  eventMealTypes: string[];
  menuPreference: string;
  venueLocation: string;
}

const EMPTY_VALUES: FormValues = {
  name: "",
  email: "",
  phone: "",
  eventTypeId: "",
  eventDate: "",
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
}

export type { FormValues as EventDetailsFormValues };

export function EventDetailsForm({ tenantSlug, businessName, eventTypes, draft }: EventDetailsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(draft?.values ?? EMPTY_VALUES);
  const [consent, setConsent] = useState(MARKETING_CONSENT_DEFAULT_CHECKED);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  const selectedEventType = eventTypes.find((et) => et.id === values.eventTypeId);
  const minGuests = selectedEventType?.minGuests ?? null;
  // 2 days' notice for customers (AJ, 2026-09-27): today and tomorrow are not selectable.
  const earliestDate = earliestPublicEventDate();

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.eventDate) {
      setError("Please choose an Event Date.");
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
    Object.entries(values).forEach(([key, value]) => {
      if (Array.isArray(value)) value.forEach((v) => formData.append(key, v));
      else if (value !== "") formData.set(key, value);
    });

    if (draft) {
      const result = await saveDetailsAction(tenantSlug, draft.id, formData);
      setPending(false);
      if (!result.ok) return setError(result.error);
      router.push(`/${tenantSlug}/plan/${draft.id}?step=menu`);
      return;
    }

    formData.set("marketingConsent", consent ? "true" : "false");
    const result = await startDraftAction(tenantSlug, formData);
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.push(`/${tenantSlug}/plan/${result.draftId}?step=menu`);
  }

  const eventTypeItems = Object.fromEntries(eventTypes.map((et) => [et.id, et.name]));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pb-28">
      <FormCard>
        <FormSection icon={User} title="About You" description="Let us know how to reach you.">
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

        <FormSection icon={CalendarDays} title="Your Event" description="Share the event details.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-date" required>Event Date</Label>
              <DateRangePicker
                id="ed-date"
                single
                startDate={values.eventDate}
                endDate={values.eventDate}
                onChange={(start) => setField("eventDate", start)}
                minDate={earliestDate}
                placeholder="Select event date"
              />
              <p className="text-xs text-muted-foreground">We need at least {PUBLIC_MIN_LEAD_DAYS} days&apos; notice, so today and tomorrow can&apos;t be booked.</p>
            </div>
            <div className="flex flex-col gap-1.5">
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

        <FormSection icon={Users} title="Guests" description="Tell us who is coming. Children are optional and help us plan the right quantities.">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-guests" required>Number of Guests</Label>
            <IconInput
              icon={Users}
              id="ed-guests"
              type="number"
              min={minGuests ?? 1}
              required
              placeholder={minGuests ? `Minimum ${minGuests} guests` : "Number of guests"}
              value={values.guestCount}
              onChange={(e) => setField("guestCount", e.target.value)}
            />
            {/* Shown from the start: the minimum depends on the event type, so until one is chosen it says so. */}
            <p className="text-xs text-muted-foreground">{minGuests ? `Minimum ${minGuests} guests required` : "The minimum number of guests depends on your event type."}</p>
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
        </FormSection>

        <FormSection icon={UtensilsCrossed} title="Meals Required" required description="Choose every meal you need. You can pick more than one.">
          <div role="group" aria-label="Meals Required" className="flex flex-wrap gap-3">
            {MEAL_TYPE_OPTIONS.map((o) => {
              const selected = values.eventMealTypes.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => setField("eventMealTypes", selected ? values.eventMealTypes.filter((m) => m !== o.value) : [...values.eventMealTypes, o.value])}
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

        <FormSection icon={Leaf} title="Menu Preference" required description="Choose your preferred menu type.">
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
      </FormCard>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <StepFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Continue to Build Your Menu"}
          <ArrowRight />
        </Button>
      </StepFooter>
    </form>
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
