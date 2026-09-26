"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail, Leaf, Drumstick, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
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
  eventMealType: string;
  menuPreference: string;
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
  eventMealType: "",
  menuPreference: "",
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
    if (!values.menuPreference) {
      setError("Please choose Vegetarian or Non-Vegetarian.");
      return;
    }
    if (!values.eventMealType) {
      setError("Please choose an Event Time.");
      return;
    }
    setPending(true);

    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== "") formData.set(key, value);
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
  const mealItems = Object.fromEntries(MEAL_TYPE_OPTIONS.map((o) => [o.value, o.label]));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-name" required>Your Name</Label>
            <IconInput icon={User} id="ed-name" required readOnly={!!draft} placeholder="Enter your full name" value={values.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-email" required>Email Address</Label>
              <IconInput icon={Mail} id="ed-email" type="email" required readOnly={!!draft} placeholder="your.email@example.com" value={values.email} onChange={(e) => setField("email", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-phone" required>Phone Number</Label>
              {draft ? (
                <Input id="ed-phone" readOnly value={values.phone} />
              ) : (
                <PhoneInput id="ed-phone" required value={values.phone} onChange={(v) => setField("phone", v)} />
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-date" required>Event Date</Label>
              <Input id="ed-date" type="date" required min={earliestDate} value={values.eventDate} onChange={(e) => setField("eventDate", e.target.value)} />
              <p className="text-xs text-muted-foreground">We need at least {PUBLIC_MIN_LEAD_DAYS} days&apos; notice, so today and tomorrow can&apos;t be booked.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-event-type" required>Event Type</Label>
              <Select items={eventTypeItems} value={values.eventTypeId} onValueChange={(v) => setField("eventTypeId", v ?? "")}>
                <SelectTrigger id="ed-event-type" className="w-full">
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
            <Label htmlFor="ed-guests" required>Number of Guests</Label>
            <Input
              id="ed-guests"
              type="number"
              min={minGuests ?? 1}
              required
              placeholder={minGuests ? `Minimum ${minGuests} guests` : "Number of guests"}
              value={values.guestCount}
              onChange={(e) => setField("guestCount", e.target.value)}
            />
            {minGuests && <p className="text-xs text-muted-foreground">Minimum {minGuests} guests required</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-kids-below-5">Number of Kids (0–5 Years)</Label>
              <Input id="ed-kids-below-5" type="number" min={0} placeholder="0" value={values.childBelow5Count} onChange={(e) => setField("childBelow5Count", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-kids-5-10">Number of Kids (5–10 Years)</Label>
              <Input id="ed-kids-5-10" type="number" min={0} placeholder="0" value={values.child5To10Count} onChange={(e) => setField("child5To10Count", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-meal-type" required>Event Time</Label>
            <Select items={mealItems} value={values.eventMealType} onValueChange={(v) => setField("eventMealType", v ?? "")}>
              <SelectTrigger id="ed-meal-type" className="w-full">
                <SelectValue placeholder="Select event time" />
              </SelectTrigger>
              <SelectContent>
                {MEAL_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label required>Menu Preference</Label>
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
          </div>

          {!draft && (
            <div className="flex items-start gap-3 rounded-lg border border-border p-3">
              <Checkbox id="ed-consent" checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5" />
              <Label htmlFor="ed-consent" className="cursor-pointer font-normal leading-5">
                Keep me posted about my event on WhatsApp and email — including occasional offers and menu ideas from {businessName}. You can opt out any time.
              </Label>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="lg" className="w-full">
        {pending ? "Saving…" : "Continue to Menu Selection"}
        <ArrowRight />
      </Button>
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
        "flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
        selected ? (tone === "success" ? "border-success bg-success/10" : "border-destructive bg-destructive/10") : "border-border hover:border-foreground/30",
      )}
    >
      <span className={cn("flex size-10 items-center justify-center rounded-lg", tone === "success" ? "bg-success/10" : "bg-destructive/10")}>{icon}</span>
      <span className="flex flex-col">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </button>
  );
}
