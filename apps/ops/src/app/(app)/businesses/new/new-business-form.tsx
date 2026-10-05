"use client";

import { Button, Card, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { createBusinessAction } from "../actions";

export function NewBusinessForm({ products }: { products: { key: string; name: string }[] }) {
  const { state, onSubmit, pending } = useFormAction(createBusinessAction, {});
  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Product" htmlFor="productKey"><select id="productKey" name="productKey" className={inputClass}>{products.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></Field>
          <Field label="Business name" htmlFor="name"><input id="name" name="name" required maxLength={200} className={inputClass} /></Field>
          <Field label="Owner's name" htmlFor="ownerName"><input id="ownerName" name="ownerName" required maxLength={200} className={inputClass} /></Field>
          <Field label="Owner's email" htmlFor="ownerEmail" hint="Billing and Platterly's messages go here."><input id="ownerEmail" name="ownerEmail" type="email" required className={inputClass} /></Field>
        </div>
      </Card>
      {state.error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create business"}</Button></div>
    </form>
  );
}
