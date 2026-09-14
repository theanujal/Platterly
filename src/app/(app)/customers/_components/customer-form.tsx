"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import type { ActionResult } from "../actions";

export interface CustomerFormValues {
  name: string;
  phone: string;
  email: string;
  addressLine1: string;
  city: string;
  state: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_CUSTOMER_VALUES: CustomerFormValues = {
  name: "",
  phone: "",
  email: "",
  addressLine1: "",
  city: "",
  state: "",
  notes: "",
  isActive: true,
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
    formData.set("addressLine1", values.addressLine1);
    formData.set("city", values.city);
    formData.set("state", values.state);
    formData.set("notes", values.notes);
    formData.set("isActive", String(values.isActive));

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
          <Input id="customer-name" required value={values.name} onChange={(e) => setField("name", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-phone">Phone</Label>
          <Input id="customer-phone" required value={values.phone} onChange={(e) => setField("phone", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-email">Email</Label>
          <Input id="customer-email" type="email" value={values.email} onChange={(e) => setField("email", e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="customer-address">Address</Label>
          <Input id="customer-address" value={values.addressLine1} onChange={(e) => setField("addressLine1", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-city">City</Label>
          <Input id="customer-city" value={values.city} onChange={(e) => setField("city", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="customer-state">State</Label>
          <Input id="customer-state" value={values.state} onChange={(e) => setField("state", e.target.value)} />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="customer-notes">Notes</Label>
          <Textarea id="customer-notes" value={values.notes} onChange={(e) => setField("notes", e.target.value)} />
        </div>
      </div>

      <label htmlFor="customer-active" className="flex w-fit cursor-pointer items-center gap-2">
        <Checkbox
          id="customer-active"
          checked={values.isActive}
          onCheckedChange={(checked) => setField("isActive", checked === true)}
        />
        <span className="text-sm font-medium">Active</span>
      </label>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
