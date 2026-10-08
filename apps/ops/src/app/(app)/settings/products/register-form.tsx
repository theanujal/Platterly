"use client";

import { Plus } from "lucide-react";
import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { registerProductAction } from "./actions";
import { SecretsPanel } from "./secrets-panel";

/** Adding a product is a name and an address. The key is made from the name; the connection settings are shown once afterwards. */
export function RegisterForm() {
  const { state, onSubmit, pending } = useFormAction(registerProductAction, {});
  return (
    <Card className="mb-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold"><Plus className="size-4" aria-hidden /> Add a product</h2>
      <p className="mb-4 text-sm text-muted-foreground">Tell Ops the product&apos;s name and where it runs. Ops then gives you its connection settings to paste into the product, once.</p>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="name"><input id="name" name="name" required className={inputClass} placeholder="Rivo" /></Field>
        <Field label="Address" htmlFor="baseUrl" hint="Where the product runs. On the same server: http://127.0.0.1:3000"><input id="baseUrl" name="baseUrl" required className={inputClass} placeholder="https://rivo.platterly.in" /></Field>
        <details className="sm:col-span-2">
          <summary className="cursor-pointer text-sm text-muted-foreground">Advanced</summary>
          <div className="mt-3 max-w-xs"><Field label="Key" htmlFor="key" hint="Short id used in addresses and invoices. Leave empty to make it from the name."><input id="key" name="key" className={inputClass} placeholder="rivo" /></Field></div>
        </details>
        <div className="sm:col-span-2"><Button type="submit" disabled={pending}>{pending ? "Adding…" : "Add product"}</Button></div>
      </form>
      {state.error ? <p role="alert" className="mt-3 text-sm text-destructive">{state.error}</p> : null}
      {state.secrets ? <div className="mt-4"><SecretsPanel reveal={state} /></div> : null}
    </Card>
  );
}
