"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { saveStandPricingAction, type StandFormState } from "./actions";

export function PricingForm({ productKey, productName, price, gstPercent, hsnCode }: { productKey: string; productName: string; price: string; gstPercent: string; hsnCode: string }) {
  const { state, onSubmit, pending } = useFormAction(saveStandPricingAction, {});
  // The saved price shows read-only; "Edit" opens the form (the same pattern as Billing).
  const [editFrom, setEditFrom] = useState<StandFormState | null>(null);
  const editing = editFrom !== null && (editFrom === state || !!state.error);
  const shown = (label: string, value: string) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd>{value}</dd></div>
  );
  return (
    <Card className="mb-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Price of the Order QR stand ({productName})</h2>
        {editing ? null : <Button type="button" variant="outline" size="md" onClick={() => setEditFrom(state)}>Edit</Button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">One stand, before GST. Shipping is included. Leave the price empty to take the stand off sale. Kitchens see the price with GST added.</p>
      {editing ? (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
          <input type="hidden" name="productKey" value={productKey} />
          <Field label="Price per stand (₹, before GST)" htmlFor="stand-price">
            <input id="stand-price" name="price" type="number" min="0" step="0.01" defaultValue={price} className={inputClass} />
          </Field>
          <Field label="GST (%)" htmlFor="stand-gst">
            <input id="stand-gst" name="gstPercent" type="number" min="0" max="40" step="0.01" defaultValue={gstPercent} className={inputClass} />
          </Field>
          <Field label="HSN / SAC code (optional)" htmlFor="stand-hsn" hint="Printed on stand invoices. Empty uses the SAC code in Billing.">
            <input id="stand-hsn" name="hsnCode" inputMode="numeric" maxLength={8} defaultValue={hsnCode} className={inputClass} />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save price"}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => setEditFrom(null)}>Cancel</Button>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
        </form>
      ) : (
        <>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {shown("Price per stand", price.trim() === "" ? "Not on sale" : `₹${Number(price).toLocaleString("en-IN")} + ${gstPercent}% GST`)}
            {shown("HSN / SAC code", hsnCode || "The SAC code in Billing")}
          </dl>
          {state.saved ? <p role="status" className="mt-3 text-sm text-success">Saved.</p> : null}
        </>
      )}
    </Card>
  );
}
