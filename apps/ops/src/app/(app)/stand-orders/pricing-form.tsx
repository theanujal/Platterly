"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { saveStandPricingAction } from "./actions";

export function PricingForm({ productKey, productName, price, gstPercent, hsnCode }: { productKey: string; productName: string; price: string; gstPercent: string; hsnCode: string }) {
  const { state, onSubmit, pending } = useFormAction(saveStandPricingAction, {});
  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-base font-semibold">Price of the Order QR stand ({productName})</h2>
      <p className="mb-4 text-sm text-muted-foreground">One stand, before GST. Shipping is included. Leave the price empty to take the stand off sale. Kitchens see the price with GST added.</p>
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
        {state.saved ? <p role="status" className="text-sm text-success">Saved.</p> : null}
        {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      </form>
    </Card>
  );
}
