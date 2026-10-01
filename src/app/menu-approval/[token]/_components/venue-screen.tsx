"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Building2, CircleCheck, MapPin, MessageSquareText, Phone, Truck, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormCard, FormSection } from "@/components/public/form-section";
import type { VenueDetails } from "@/modules/menu-approvals/approval-link";
import type { ApprovalView } from "@/modules/menu-approvals/approval-view";
import { VENUE_TYPE_OPTIONS } from "@/modules/menu-approvals/venue-options";
import { askAboutApprovedMenuAction, submitVenueAction } from "../actions";
import { ApprovedMenuCard } from "./approved-menu-card";

const venueTypeItems = Object.fromEntries(VENUE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

/**
 * VENUE stage of the approval link: the menu is approved, now the customer says where and how to deliver. The
 * address starts with the Venue Location they gave at the beginning. Required: venue type, venue / building name,
 * complete address, contact person and number; the rest is optional.
 */
export function VenueScreen({ token, view, initial }: { token: string; view: ApprovalView; initial: VenueDetails }) {
  const router = useRouter();
  const [values, setValues] = useState({
    venueType: initial.venueType ?? "",
    venueBuildingName: initial.venueBuildingName,
    venueDoorNumber: initial.venueDoorNumber,
    venueTower: initial.venueTower,
    venueFloor: initial.venueFloor,
    completeVenueAddress: initial.completeVenueAddress,
    venueLandmark: initial.venueLandmark,
    venueContactName: initial.venueContactName,
    venueContactPhone: initial.venueContactPhone,
    venueAccessInstructions: initial.venueAccessInstructions,
    cookingInstructions: initial.cookingInstructions,
    gasElectricAvailable: initial.gasElectricAvailable,
    liveCounterAvailable: initial.liveCounterAvailable,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) => setValues((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!values.venueType) return setError("Venue Type is required.");
    if (!values.venueContactPhone) return setError("Contact Number is required.");
    setPending(true);
    const result = await submitVenueAction(token, values);
    if (!result.ok) {
      setPending(false);
      return setError(result.error);
    }
    // The same link now shows the Confirmation.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div role="status" className="flex items-start gap-3 rounded-xl border border-success/30 bg-success/10 p-4">
        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" />
        <div className="text-sm">
          <p className="font-semibold">Menu Approved</p>
          <p className="text-muted-foreground">Great! Your menu has been approved. Please share your venue and delivery details to help us plan the event.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <ApprovedMenuCard view={view} />
          <ChangesCard token={token} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormCard>
            <FormSection icon={Building2} title="Venue Details" description="Help us find the event location and set up everything smoothly.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vd-type" required>Venue Type</Label>
                  <Select items={venueTypeItems} value={values.venueType} onValueChange={(v) => set("venueType", v ?? "")}>
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
                  <IconInput icon={Building2} id="vd-building" required placeholder="Enter venue / building name" value={values.venueBuildingName} onChange={(e) => set("venueBuildingName", e.target.value)} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={MapPin} title="Address" description="Where exactly should we come?">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vd-door">Door / Flat / House No.</Label>
                  <Input id="vd-door" placeholder="e.g. B-1204" value={values.venueDoorNumber} onChange={(e) => set("venueDoorNumber", e.target.value)} />
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
                <Label htmlFor="vd-address" required>Complete Venue Address</Label>
                <Textarea id="vd-address" required placeholder="Enter complete venue address" value={values.completeVenueAddress} onChange={(e) => set("completeVenueAddress", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vd-landmark">Landmark (Optional)</Label>
                <IconInput icon={MapPin} id="vd-landmark" placeholder="e.g. Near Varthur Lake" value={values.venueLandmark} onChange={(e) => set("venueLandmark", e.target.value)} />
              </div>
            </FormSection>

            <FormSection icon={Phone} title="Venue Contact" description="Someone we can call on the day.">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vd-contact-name" required>Contact Person</Label>
                  <IconInput icon={User} id="vd-contact-name" required placeholder="Enter contact person name" value={values.venueContactName} onChange={(e) => set("venueContactName", e.target.value)} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="vd-contact-phone" required>Contact Number</Label>
                  <PhoneInput id="vd-contact-phone" value={values.venueContactPhone} onChange={(v) => set("venueContactPhone", v)} />
                </div>
              </div>
            </FormSection>

            <FormSection icon={Truck} title="Access & Logistics" description="How our team reaches you and what to expect on site.">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vd-access">Loading / Access Instructions (Optional)</Label>
                <Textarea id="vd-access" placeholder="Enter loading / access instructions" value={values.venueAccessInstructions} onChange={(e) => set("venueAccessInstructions", e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vd-cooking">Cooking Instructions (Optional)</Label>
                <Textarea id="vd-cooking" placeholder="e.g. Jain food to be cooked separately, or no onion and garlic" value={values.cookingInstructions} onChange={(e) => set("cookingInstructions", e.target.value)} />
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3">
                <Checkbox id="vd-gas-electric" className="border-foreground/40" checked={values.gasElectricAvailable} onCheckedChange={(c) => set("gasElectricAvailable", c === true)} />
                <Label htmlFor="vd-gas-electric" className="cursor-pointer font-normal">
                  Gas / electric connection available at venue?
                </Label>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 p-3">
                <Checkbox id="vd-live-counter" className="border-foreground/40" checked={values.liveCounterAvailable} onCheckedChange={(c) => set("liveCounterAvailable", c === true)} />
                <Label htmlFor="vd-live-counter" className="cursor-pointer font-normal">
                  Cooking live counter facility available?
                </Label>
              </div>
            </FormSection>
          </FormCard>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Continue"}
              <ArrowRight />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** "Need to make changes?": leaves a note for the team about the approved menu (nothing is reopened automatically). */
export function ChangesCard({ token }: { token: string }) {
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
      <p className="text-sm text-muted-foreground">If you want to change the approved menu, please contact our team. You can also send us a note here.</p>
      {sent && (
        <p role="status" className="text-sm font-medium text-success">
          Thanks, we&apos;ve passed your note to our team.
        </p>
      )}
      {open ? (
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
        <Button type="button" variant="outline" size="md" onClick={() => { setOpen(true); setSent(false); }}>
          Request Menu Changes
        </Button>
      )}
    </FormCard>
  );
}
