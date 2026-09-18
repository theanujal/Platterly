"use client";

import { useState } from "react";
import { User, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconInput } from "@/components/ui/icon-input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ActiveToggleCard } from "@/components/ui/active-toggle-card";
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

export interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  notes: string;
  isActive: boolean;
  isEnquiry: boolean;
  leadSource: string;
}

export const EMPTY_CUSTOMER_VALUES: CustomerFormValues = {
  name: "",
  phone: "",
  email: "",
  notes: "",
  isActive: true,
  isEnquiry: false,
  leadSource: "MANUAL_ENTRY",
};

interface CustomerFormProps {
  initialValues?: Partial<CustomerFormValues>;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function CustomerForm({ initialValues, onSubmit, onSuccess, submitLabel }: CustomerFormProps) {
  const [values, setValues] = useState<CustomerFormValues>({ ...EMPTY_CUSTOMER_VALUES, ...initialValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField<K extends keyof CustomerFormValues>(key: K, value: CustomerFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("phone", values.phone);
    formData.set("email", values.email);
    formData.set("isActive", String(values.isActive));
    formData.set("isEnquiry", String(values.isEnquiry));
    if (values.isEnquiry) {
      formData.set("leadSource", values.leadSource);
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
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="customer-name">Name</Label>
          <IconInput icon={User} id="customer-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-phone">Phone</Label>
          <PhoneInput id="customer-phone" required value={values.phone} onChange={(v) => setField("phone", v)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-email">Email</Label>
          <IconInput icon={Mail} id="customer-email" type="email" value={values.email} onChange={(e) => setField("email", e.target.value)} />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border p-3">
        <Checkbox id="customer-is-enquiry" checked={values.isEnquiry} onCheckedChange={(checked) => setField("isEnquiry", checked === true)} />
        <Label htmlFor="customer-is-enquiry" className="cursor-pointer font-normal">
          Is this an enquiry?
        </Label>
      </div>

      {values.isEnquiry && (
        <div className="flex flex-col gap-4 border-t border-border pt-4">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lead Information</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-lead-source">Lead Source</Label>
            <Select
              items={Object.fromEntries(LEAD_SOURCE_OPTIONS.map((o) => [o.value, o.label]))}
              value={values.leadSource}
              onValueChange={(v) => setField("leadSource", v ?? values.leadSource)}
            >
              <SelectTrigger id="customer-lead-source">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="customer-notes">Notes</Label>
            <Textarea
              id="customer-notes"
              placeholder="Add any notes about this lead..."
              value={values.notes}
              onChange={(e) => setField("notes", e.target.value)}
            />
          </div>
        </div>
      )}

      <ActiveToggleCard
        id="customer-active"
        checked={values.isActive}
        onCheckedChange={(checked) => setField("isActive", checked)}
      />

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
