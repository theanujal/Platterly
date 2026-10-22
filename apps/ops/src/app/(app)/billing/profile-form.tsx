"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { saveProfileAction, type ProfileFormState } from "./actions";

export interface ProfileValues {
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  stateCode: string;
  postalCode: string;
  country: string;
  gstin: string;
  pan: string;
  sacCode: string;
  invoicePrefix: string;
  email: string;
  phone: string;
  website: string;
  invoiceNote: string;
}

export function ProfileForm({ values }: { values: ProfileValues }) {
  const { state, onSubmit, pending } = useFormAction(saveProfileAction, {});
  // Saved details show read-only; "Edit" opens the form. The answer that was current when Edit was clicked is kept, so a newer
  // answer that saved closes the form again, and one with an error leaves it open with what was typed.
  const [editFrom, setEditFrom] = useState<ProfileFormState | null>(null);
  const editing = editFrom !== null && (editFrom === state || !!state.error);
  const text = (name: keyof ProfileValues, label: string, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}>
      <input id={name} name={name} defaultValue={values[name]} className={inputClass} />
    </Field>
  );
  const shown = (label: string, value: string, mono = false) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`whitespace-pre-line ${mono ? "font-mono" : ""}`}>{value || "Not set"}</dd></div>
  );
  const editButton = <Button type="button" variant="outline" size="md" onClick={() => setEditFrom(state)}>Edit</Button>;

  if (!editing) {
    const address = [values.addressLine1, values.addressLine2, values.city, values.state, values.postalCode, values.country].filter(Boolean).join(", ");
    return (
      <div className="grid gap-6">
        <Card>
          <div className="mb-1 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Seller details on invoices</h2>
            {editButton}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">Platterly&apos;s own details, printed on every plan invoice. A blank one is left off.</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {shown("Legal name", values.legalName)}
            {shown("GSTIN", values.gstin, true)}
            <div className="sm:col-span-2">{shown("Address", address)}</div>
            {shown("State code", values.stateCode, true)}
            {shown("PAN", values.pan, true)}
            {shown("Email", values.email)}
            {shown("Phone", values.phone)}
            {shown("Website", values.website)}
            {shown("SAC code", values.sacCode, true)}
          </dl>
        </Card>
        {state.saved ? <p role="status" className="text-sm text-success">Saved.</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <Card>
        <h2 className="mb-1 text-base font-semibold">Seller details on invoices</h2>
        <p className="mb-4 text-sm text-muted-foreground">Platterly&apos;s own details, printed on every plan invoice. Every field is optional; a blank one is left off.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("legalName", "Legal name")}
          {text("gstin", "GSTIN", "Looks like 29ABCDE1234F1Z5")}
          {text("addressLine1", "Address line 1")}
          {text("addressLine2", "Address line 2")}
          {text("city", "City")}
          {text("state", "State")}
          {text("stateCode", "State code", "Two digits, for example 29. Decides CGST + SGST versus IGST.")}
          {text("postalCode", "Postal code")}
          {text("country", "Country")}
          {text("pan", "PAN", "Looks like ABCDE1234F")}
          {text("email", "Email")}
          {text("phone", "Phone")}
          {text("website", "Website")}
          {text("sacCode", "SAC code", "998314 is hosting / IT infrastructure; confirm with your CA.")}
        </div>
        {/* The prefix is set per product now; the saved fallback is kept. There is no invoice note any more, so saving clears it. */}
        <input type="hidden" name="invoicePrefix" value={values.invoicePrefix} />
      </Card>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save billing details"}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setEditFrom(null)}>Cancel</Button>
      </div>
    </form>
  );
}
