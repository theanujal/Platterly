"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { submitEventDetailsAction } from "../actions";

const MEAL_TYPE_OPTIONS = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "HITEA", label: "Hi-Tea" },
  { value: "DINNER", label: "Dinner" },
  { value: "OTHER", label: "Other" },
] as const;

const MENU_PREFERENCE_OPTIONS = [
  { value: "VEGETARIAN", label: "Vegetarian — Pure veg menu" },
  { value: "NON_VEGETARIAN", label: "Non-Vegetarian — Includes meat options" },
] as const;

const VENUE_TYPE_OPTIONS = [
  { value: "CLUBHOUSE", label: "Clubhouse" },
  { value: "HOTEL", label: "Hotel" },
  { value: "BANQUET_HALL", label: "Banquet Hall" },
  { value: "RESORT", label: "Resort" },
  { value: "HOME", label: "Home" },
  { value: "OFFICE", label: "Office" },
  { value: "OTHER", label: "Other" },
] as const;

const VEHICLE_ACCESS_OPTIONS = [
  { value: "VEHICLE_AND_PARKING", label: "Vehicle can enter venue & parking available" },
  { value: "VEHICLE_NO_PARKING", label: "Vehicle can enter but no parking" },
  { value: "NO_VEHICLE_ACCESS", label: "Vehicle cannot enter venue" },
  { value: "MANUAL_LOADING_REQUIRED", label: "Manual loading required" },
] as const;

interface EventDetailsFormProps {
  tenantSlug: string;
  eventTypes: { id: string; name: string }[];
}

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
  venueType: string;
  venueBuildingName: string;
  venueDoorNumber: string;
  venueTower: string;
  venueFloor: string;
  venueHallName: string;
  completeVenueAddress: string;
  venueLandmark: string;
  venueContactName: string;
  venueContactPhone: string;
  venueAccessInstructions: string;
  vehicleAccess: string;
  liveCounterAvailable: string;
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
  venueType: "",
  venueBuildingName: "",
  venueDoorNumber: "",
  venueTower: "",
  venueFloor: "",
  venueHallName: "",
  completeVenueAddress: "",
  venueLandmark: "",
  venueContactName: "",
  venueContactPhone: "",
  venueAccessInstructions: "",
  vehicleAccess: "",
  liveCounterAvailable: "",
};

function selectItemsMap(options: readonly { value: string; label: string }[]) {
  return Object.fromEntries(options.map((o) => [o.value, o.label]));
}

export function EventDetailsForm({ tenantSlug, eventTypes }: EventDetailsFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(EMPTY_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== "") formData.set(key, value);
    });

    const result = await submitEventDetailsAction(tenantSlug, formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/${tenantSlug}/menu-selection/${result.menuSelectionId}`);
  }

  const eventTypeItems = Object.fromEntries(eventTypes.map((et) => [et.id, et.name]));

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-name">Your Name *</Label>
            <IconInput icon={User} id="ed-name" required placeholder="Enter your full name" value={values.name} onChange={(e) => setField("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-email">Email Address *</Label>
              <IconInput icon={Mail} id="ed-email" type="email" required placeholder="your.email@example.com" value={values.email} onChange={(e) => setField("email", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-phone">Phone Number *</Label>
              <PhoneInput id="ed-phone" required value={values.phone} onChange={(v) => setField("phone", v)} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-date">Event Date *</Label>
              <Input id="ed-date" type="date" required value={values.eventDate} onChange={(e) => setField("eventDate", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-event-type">Event Type *</Label>
              <Select items={eventTypeItems} value={values.eventTypeId} onValueChange={(v) => setField("eventTypeId", v ?? "")}>
                <SelectTrigger id="ed-event-type">
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
            <Label htmlFor="ed-guests">Number of Guests *</Label>
            <Input id="ed-guests" type="number" min={1} required placeholder="Minimum 50 guests" value={values.guestCount} onChange={(e) => setField("guestCount", e.target.value)} />
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
            <Label htmlFor="ed-meal-type">Event Time *</Label>
            <Select items={selectItemsMap(MEAL_TYPE_OPTIONS)} value={values.eventMealType} onValueChange={(v) => setField("eventMealType", v ?? "")}>
              <SelectTrigger id="ed-meal-type">
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
            <Label htmlFor="ed-menu-preference">Menu Preference *</Label>
            <Select items={selectItemsMap(MENU_PREFERENCE_OPTIONS)} value={values.menuPreference} onValueChange={(v) => setField("menuPreference", v ?? "")}>
              <SelectTrigger id="ed-menu-preference">
                <SelectValue placeholder="Select menu preference" />
              </SelectTrigger>
              <SelectContent>
                {MENU_PREFERENCE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Venue & Delivery Details</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-venue-type">Venue Type *</Label>
            <Select items={selectItemsMap(VENUE_TYPE_OPTIONS)} value={values.venueType} onValueChange={(v) => setField("venueType", v ?? "")}>
              <SelectTrigger id="ed-venue-type">
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
            <Label htmlFor="ed-venue-building">Venue / Building Name *</Label>
            <Input id="ed-venue-building" placeholder="Enter venue / building name" value={values.venueBuildingName} onChange={(e) => setField("venueBuildingName", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-venue-door">Door / Flat / House No. *</Label>
              <Input id="ed-venue-door" placeholder="e.g. B-1204" value={values.venueDoorNumber} onChange={(e) => setField("venueDoorNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-venue-tower">Tower / Block</Label>
              <Input id="ed-venue-tower" placeholder="e.g. Tower B" value={values.venueTower} onChange={(e) => setField("venueTower", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-venue-floor">Floor</Label>
              <Input id="ed-venue-floor" placeholder="e.g. 12th Floor" value={values.venueFloor} onChange={(e) => setField("venueFloor", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-venue-hall">Function Area / Hall Name *</Label>
            <Input id="ed-venue-hall" placeholder="e.g. Clubhouse" value={values.venueHallName} onChange={(e) => setField("venueHallName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-venue-address">Complete Venue Address *</Label>
            <Textarea id="ed-venue-address" placeholder="Enter complete venue address" value={values.completeVenueAddress} onChange={(e) => setField("completeVenueAddress", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-venue-landmark">Landmark (Optional)</Label>
            <Input id="ed-venue-landmark" placeholder="e.g. Near Varthur Lake" value={values.venueLandmark} onChange={(e) => setField("venueLandmark", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-venue-contact-name">Venue Contact Person *</Label>
              <Input id="ed-venue-contact-name" placeholder="Enter contact person name" value={values.venueContactName} onChange={(e) => setField("venueContactName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ed-venue-contact-phone">Contact Number *</Label>
              <PhoneInput id="ed-venue-contact-phone" value={values.venueContactPhone} onChange={(v) => setField("venueContactPhone", v)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-venue-access">Catering Access / Loading Instructions (Optional)</Label>
            <Textarea id="ed-venue-access" placeholder="Enter loading / access instructions" value={values.venueAccessInstructions} onChange={(e) => setField("venueAccessInstructions", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ed-vehicle-access">Vehicle Access *</Label>
            <Select items={selectItemsMap(VEHICLE_ACCESS_OPTIONS)} value={values.vehicleAccess} onValueChange={(v) => setField("vehicleAccess", v ?? "")}>
              <SelectTrigger id="ed-vehicle-access">
                <SelectValue placeholder="Select vehicle access" />
              </SelectTrigger>
              <SelectContent>
                {VEHICLE_ACCESS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-border p-3">
            <Checkbox
              id="ed-live-counter"
              checked={values.liveCounterAvailable === "true"}
              onCheckedChange={(checked) => setField("liveCounterAvailable", checked === true ? "true" : "false")}
            />
            <Label htmlFor="ed-live-counter" className="cursor-pointer font-normal">
              Cooking live counter facility available?
            </Label>
          </div>
        </CardContent>
      </Card>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} size="lg">
        {pending ? "Submitting…" : "Continue to Menu Selection"}
      </Button>
    </form>
  );
}
