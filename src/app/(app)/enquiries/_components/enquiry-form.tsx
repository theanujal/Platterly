"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ActionResult } from "../actions";

const LEAD_SOURCE_OPTIONS = [
  { value: "MANUAL_ENTRY", label: "Manual Entry" },
  { value: "REFERRAL", label: "Referral" },
  { value: "WEBSITE", label: "Website" },
  { value: "SOCIAL_MEDIA", label: "Social Media" },
  { value: "ADVERTISEMENT", label: "Advertisement" },
  { value: "COLD_CALL", label: "Cold Call" },
  { value: "NETWORKING", label: "Networking" },
  { value: "OTHER", label: "Other" },
] as const;

const STATUS_OPTIONS = [
  { value: "NEW", label: "New" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "QUOTATION_SENT", label: "Quotation Sent" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "CONVERTED", label: "Converted" },
  { value: "LOST", label: "Lost" },
] as const;

export interface EnquiryFormValues {
  name: string;
  phone: string;
  leadSource: string;
  status: string;
  eventTypeId: string;
  eventDate: string;
  guestCount: string;
  venue: string;
  requirements: string;
  budget: string;
  preferredMenuId: string;
  notes: string;
}

export const EMPTY_ENQUIRY_VALUES: EnquiryFormValues = {
  name: "",
  phone: "",
  leadSource: "MANUAL_ENTRY",
  status: "NEW",
  eventTypeId: "",
  eventDate: "",
  guestCount: "",
  venue: "",
  requirements: "",
  budget: "",
  preferredMenuId: "",
  notes: "",
};

interface EnquiryFormProps {
  initialValues?: Partial<EnquiryFormValues>;
  /** The lightweight "Add New Lead" form (Updated doc §11) shows only Name/Phone/Lead toggle/Source; the fuller Enquiry fields appear once editing. */
  showFullFields?: boolean;
  eventTypes: { id: string; name: string }[];
  menus: { id: string; name: string }[];
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function EnquiryForm({ initialValues, showFullFields, eventTypes, menus, onSubmit, onSuccess, submitLabel }: EnquiryFormProps) {
  const [values, setValues] = useState<EnquiryFormValues>({ ...EMPTY_ENQUIRY_VALUES, ...initialValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof EnquiryFormValues>(key: K, value: EnquiryFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("phone", values.phone);
    formData.set("leadSource", values.leadSource);
    if (showFullFields) {
      formData.set("status", values.status);
      formData.set("eventTypeId", values.eventTypeId);
      formData.set("eventDate", values.eventDate);
      formData.set("guestCount", values.guestCount);
      formData.set("venue", values.venue);
      formData.set("requirements", values.requirements);
      formData.set("budget", values.budget);
      formData.set("preferredMenuId", values.preferredMenuId);
      formData.set("notes", values.notes);
    }

    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enquiry-name">Name</Label>
          <Input id="enquiry-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="enquiry-phone">Phone Number</Label>
          <Input id="enquiry-phone" required value={values.phone} onChange={(e) => setField("phone", e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="enquiry-source">Lead Source</Label>
          <Select
            items={Object.fromEntries(LEAD_SOURCE_OPTIONS.map((o) => [o.value, o.label]))}
            value={values.leadSource}
            onValueChange={(v) => setField("leadSource", v ?? values.leadSource)}
          >
            <SelectTrigger id="enquiry-source">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAD_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {showFullFields && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enquiry-status">Status</Label>
              <Select
                items={Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]))}
                value={values.status}
                onValueChange={(v) => setField("status", v ?? values.status)}
              >
                <SelectTrigger id="enquiry-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enquiry-event-type">Event Type</Label>
              <Select
                items={Object.fromEntries(eventTypes.map((t) => [t.id, t.name]))}
                value={values.eventTypeId}
                onValueChange={(v) => setField("eventTypeId", v ?? values.eventTypeId)}
              >
                <SelectTrigger id="enquiry-event-type">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {eventTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enquiry-event-date">Event Date</Label>
              <Input id="enquiry-event-date" type="date" value={values.eventDate} onChange={(e) => setField("eventDate", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enquiry-guests">Guest Count</Label>
              <Input
                id="enquiry-guests"
                type="number"
                min="0"
                value={values.guestCount}
                onChange={(e) => setField("guestCount", e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enquiry-venue">Venue</Label>
              <Input id="enquiry-venue" value={values.venue} onChange={(e) => setField("venue", e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="enquiry-budget">Budget (₹)</Label>
              <Input
                id="enquiry-budget"
                type="number"
                min="0"
                step="0.01"
                value={values.budget}
                onChange={(e) => setField("budget", e.target.value)}
              />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="enquiry-menu">Preferred Menu</Label>
              <Select
                items={Object.fromEntries(menus.map((m) => [m.id, m.name]))}
                value={values.preferredMenuId}
                onValueChange={(v) => setField("preferredMenuId", v ?? values.preferredMenuId)}
              >
                <SelectTrigger id="enquiry-menu">
                  <SelectValue placeholder="Not set" />
                </SelectTrigger>
                <SelectContent>
                  {menus.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enquiry-requirements">Requirements</Label>
            <Textarea id="enquiry-requirements" value={values.requirements} onChange={(e) => setField("requirements", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="enquiry-notes">Notes</Label>
            <Textarea id="enquiry-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-end">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
