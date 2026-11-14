"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { createCouponAction } from "./actions";

export function CouponForm({ products }: { products: { key: string; name: string }[] }) {
  const { state, onSubmit, pending } = useFormAction(createCouponAction, {});
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">New coupon</h2>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Code" htmlFor="code" hint="Customers type this at checkout. Capitals, no spaces.">
          <input id="code" name="code" className={inputClass} maxLength={32} autoComplete="off" required />
        </Field>
        <Field label="Type" htmlFor="kind">
          <select id="kind" name="kind" className={inputClass} defaultValue="PERCENT">
            <option value="PERCENT">Percent off</option>
            <option value="FIXED">Rupees off</option>
          </select>
        </Field>
        <Field label="Value" htmlFor="value" hint="A percentage from 1 to 100, or rupees before GST.">
          <input id="value" name="value" type="number" step="0.01" min="0" className={inputClass} required />
        </Field>
        <Field label="Maximum uses" htmlFor="maxUses" hint="Leave blank for no limit. Only paid orders count.">
          <input id="maxUses" name="maxUses" type="number" min="1" step="1" className={inputClass} />
        </Field>
        <Field label="Last day it works" htmlFor="expiresAt" hint="Leave blank for no expiry.">
          <input id="expiresAt" name="expiresAt" type="date" className={inputClass} />
        </Field>
        <Field label="Product" htmlFor="productKey" hint="Any product, or only one.">
          <select id="productKey" name="productKey" className={inputClass} defaultValue="">
            <option value="">Any product</option>
            {products.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Note (only staff see it)" htmlFor="note">
            <input id="note" name="note" className={inputClass} maxLength={200} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create coupon"}</Button>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
          {state.saved ? <p role="status" className="text-sm text-success">Coupon {state.saved} created.</p> : null}
        </div>
      </form>
    </Card>
  );
}
