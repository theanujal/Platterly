"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { saveProfileAction } from "./actions";

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

export function ProfileForm({ values, nextInvoicePreview }: { values: ProfileValues; nextInvoicePreview: string }) {
  const { state, onSubmit, pending } = useFormAction(saveProfileAction, {});
  const text = (name: keyof ProfileValues, label: string, hint?: string) => (
    <Field label={label} htmlFor={name} hint={hint}>
      <input id={name} name={name} defaultValue={values[name]} className={inputClass} />
    </Field>
  );
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
      </Card>
      <Card>
        <h2 className="mb-1 text-base font-semibold">Invoice numbering</h2>
        <p className="mb-4 text-sm text-muted-foreground">Format: prefix, the business&apos;s initials, year, month and one running number. The next invoice would look like <span className="font-mono">{nextInvoicePreview}</span>. The running number never repeats.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {text("invoicePrefix", "Invoice prefix", "1 to 6 letters or digits")}
          <div className="sm:col-span-2">
            <Field label="Note printed on every invoice" htmlFor="invoiceNote">
              <textarea id="invoiceNote" name="invoiceNote" rows={3} defaultValue={values.invoiceNote} className={`${inputClass} h-auto py-2`} />
            </Field>
          </div>
        </div>
      </Card>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-success">Saved.</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save billing details"}</Button></div>
    </form>
  );
}
