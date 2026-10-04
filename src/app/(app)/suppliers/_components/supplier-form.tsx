"use client";

import { useState } from "react";
import { Building2, Mail, MapPin, Phone, User } from "lucide-react";
import { DrawerForm } from "@/components/catalog/form-drawer";
import { IconInput } from "@/components/ui/icon-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "../actions";

export interface SupplierFormValues {
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  gstin: string;
  notes: string;
  isActive: boolean;
}

export const EMPTY_SUPPLIER_VALUES: SupplierFormValues = { name: "", contactPerson: "", phone: "", email: "", address: "", gstin: "", notes: "", isActive: true };

export function SupplierForm({
  initialValues,
  submitLabel,
  onSubmit,
  onSuccess,
  onCancel,
}: {
  initialValues?: SupplierFormValues;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<ActionResult>;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<SupplierFormValues>(initialValues ?? EMPTY_SUPPLIER_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const set = <K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) => setValues((v) => ({ ...v, [key]: value }));

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const formData = new FormData();
    for (const [key, value] of Object.entries(values)) formData.set(key, String(value));
    const result = await onSubmit(formData);
    setPending(false);
    if (!result.ok) return setError(result.error);
    onSuccess();
  }

  return (
    <DrawerForm
      onSubmit={handleSubmit}
      error={error}
      pending={pending}
      submitLabel={submitLabel}
      onCancel={onCancel}
      active={{ id: "supplier-active", checked: values.isActive, onChange: (c) => set("isActive", c), onLabel: "Active (can be picked)", offLabel: "Inactive (hidden from pickers)" }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sup-name">Supplier Name</Label>
        <IconInput icon={Building2} id="sup-name" required value={values.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sup-contact">Contact Person</Label>
        <IconInput icon={User} id="sup-contact" value={values.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sup-phone">Phone</Label>
          <IconInput icon={Phone} id="sup-phone" type="tel" value={values.phone} onChange={(e) => set("phone", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sup-email">Email</Label>
          <IconInput icon={Mail} id="sup-email" type="email" value={values.email} onChange={(e) => set("email", e.target.value)} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sup-address">Address</Label>
        <IconInput icon={MapPin} id="sup-address" value={values.address} onChange={(e) => set("address", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sup-gstin">GSTIN</Label>
        <IconInput icon={Building2} id="sup-gstin" maxLength={20} value={values.gstin} onChange={(e) => set("gstin", e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sup-notes">Notes</Label>
        <Textarea id="sup-notes" value={values.notes} onChange={(e) => set("notes", e.target.value)} />
      </div>
    </DrawerForm>
  );
}
