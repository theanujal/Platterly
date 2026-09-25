"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import type { DraftVenue } from "@/modules/menu-approvals/storefront-draft";
import { saveVenueAction } from "../actions";

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

const toItems = (options: readonly { value: string; label: string }[]) => Object.fromEntries(options.map((o) => [o.value, o.label]));

const EMPTY: Record<keyof DraftVenue, string> = {
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
  liveCounterAvailable: "false",
};

interface VenueStepProps {
  tenantSlug: string;
  draftId: string;
  initial?: DraftVenue;
}

export function VenueStep({ tenantSlug, draftId, initial }: VenueStepProps) {
  const router = useRouter();
  const [values, setValues] = useState<Record<keyof DraftVenue, string>>(
    initial ? ({ ...EMPTY, ...Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, String(v ?? "")])) } as Record<keyof DraftVenue, string>) : EMPTY,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof DraftVenue, value: string) => setValues((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    Object.entries(values).forEach(([key, value]) => formData.set(key, value));
    const result = await saveVenueAction(tenantSlug, draftId, formData);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.push(`/${tenantSlug}/plan/${draftId}?step=review`);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Venue & Delivery Details</h2>
        <p className="text-sm text-muted-foreground">Where should we deliver and set up?</p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vd-type" required>Venue Type</Label>
            <Select items={toItems(VENUE_TYPE_OPTIONS)} value={values.venueType} onValueChange={(v) => set("venueType", v ?? "")}>
              <SelectTrigger id="vd-type" className="w-full">
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
            <Label htmlFor="vd-building" required>Venue / Building Name</Label>
            <Input id="vd-building" required placeholder="Enter venue / building name" value={values.venueBuildingName} onChange={(e) => set("venueBuildingName", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vd-door" required>Door / Flat / House No.</Label>
              <Input id="vd-door" required placeholder="e.g. B-1204" value={values.venueDoorNumber} onChange={(e) => set("venueDoorNumber", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vd-tower">Tower / Block</Label>
              <Input id="vd-tower" placeholder="e.g. Tower B" value={values.venueTower} onChange={(e) => set("venueTower", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vd-floor">Floor</Label>
              <Input id="vd-floor" placeholder="e.g. 12th Floor" value={values.venueFloor} onChange={(e) => set("venueFloor", e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vd-hall" required>Function Area / Hall Name</Label>
            <Input id="vd-hall" required placeholder="e.g. Clubhouse" value={values.venueHallName} onChange={(e) => set("venueHallName", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vd-address" required>Complete Venue Address</Label>
            <Textarea id="vd-address" required placeholder="Enter complete venue address" value={values.completeVenueAddress} onChange={(e) => set("completeVenueAddress", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vd-landmark">Landmark (Optional)</Label>
            <Input id="vd-landmark" placeholder="e.g. Near Varthur Lake" value={values.venueLandmark} onChange={(e) => set("venueLandmark", e.target.value)} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vd-contact-name" required>Venue Contact Person</Label>
              <Input id="vd-contact-name" required placeholder="Enter contact person name" value={values.venueContactName} onChange={(e) => set("venueContactName", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vd-contact-phone" required>Contact Number</Label>
              <PhoneInput id="vd-contact-phone" value={values.venueContactPhone} onChange={(v) => set("venueContactPhone", v)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vd-access">Catering Access / Loading Instructions (Optional)</Label>
            <Textarea id="vd-access" placeholder="Enter loading / access instructions" value={values.venueAccessInstructions} onChange={(e) => set("venueAccessInstructions", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vd-vehicle" required>Vehicle Access</Label>
            <Select items={toItems(VEHICLE_ACCESS_OPTIONS)} value={values.vehicleAccess} onValueChange={(v) => set("vehicleAccess", v ?? "")}>
              <SelectTrigger id="vd-vehicle" className="w-full">
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
            <Checkbox id="vd-live-counter" checked={values.liveCounterAvailable === "true"} onCheckedChange={(c) => set("liveCounterAvailable", c === true ? "true" : "false")} />
            <Label htmlFor="vd-live-counter" className="cursor-pointer font-normal">
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
      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => router.push(`/${tenantSlug}/plan/${draftId}?step=items`)}>
          <ArrowLeft /> Back
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Review Order"}
          <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
