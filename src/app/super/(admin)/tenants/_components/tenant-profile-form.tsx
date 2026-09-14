"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "../actions";

export interface TenantProfileFormValues {
  name: string;
  slug: string;
  ownerFirstName: string;
  ownerLastName: string;
  contactPhone: string;
  contactEmail: string;
  gstNumber: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

const EMPTY_VALUES: TenantProfileFormValues = {
  name: "",
  slug: "",
  ownerFirstName: "",
  ownerLastName: "",
  contactPhone: "",
  contactEmail: "",
  gstNumber: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

interface FieldConfig {
  key: keyof TenantProfileFormValues;
  label: string;
  required?: boolean;
}

const FIELDS: FieldConfig[] = [
  { key: "name", label: "Business name", required: true },
  { key: "ownerFirstName", label: "Owner first name" },
  { key: "ownerLastName", label: "Owner last name" },
  { key: "contactPhone", label: "Phone" },
  { key: "contactEmail", label: "Email" },
  { key: "gstNumber", label: "GST number" },
  { key: "addressLine1", label: "Address line 1" },
  { key: "addressLine2", label: "Address line 2" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "postalCode", label: "Postal code" },
  { key: "country", label: "Country" },
];

interface TenantProfileFormProps {
  /** Whether to render the slug field — only on creation; slug changes go through the dedicated override action. */
  includeSlug?: boolean;
  initialValues?: Partial<TenantProfileFormValues>;
  onSubmit: (values: TenantProfileFormValues) => Promise<ActionResult>;
  onSuccess: () => void;
  submitLabel: string;
}

export function TenantProfileForm({
  includeSlug = false,
  initialValues,
  onSubmit,
  onSuccess,
  submitLabel,
}: TenantProfileFormProps) {
  const [values, setValues] = useState<TenantProfileFormValues>({ ...EMPTY_VALUES, ...initialValues });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function setField(key: keyof TenantProfileFormValues) {
    return (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [key]: event.target.value }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const result = await onSubmit(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSuccess();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {includeSlug && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="slug">Storefront slug</Label>
          <Input id="slug" required maxLength={20} value={values.slug} onChange={setField("slug")} />
        </div>
      )}
      {FIELDS.map((field) => (
        <div key={field.key} className="flex flex-col gap-1.5">
          <Label htmlFor={field.key}>{field.label}</Label>
          <Input
            id={field.key}
            required={field.required}
            value={values[field.key]}
            onChange={setField(field.key)}
          />
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
