"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { registerProductAction } from "./actions";
import { SecretsPanel } from "./secrets-panel";

export function RegisterForm() {
  const { state, onSubmit, pending } = useFormAction(registerProductAction, {});
  return (
    <Card className="mb-6">
      <h2 className="mb-1 text-base font-semibold">Register a product</h2>
      <p className="mb-4 text-sm text-muted-foreground">Ops creates the two signing secrets. Put them in the product&apos;s environment, then refresh its manifest.</p>
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Key" htmlFor="key" hint="Lowercase, matches the subdomain. Example: catering">
          <input id="key" name="key" required className={inputClass} placeholder="catering" />
        </Field>
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required className={inputClass} placeholder="Catering" />
        </Field>
        <Field label="Base URL" htmlFor="baseUrl" hint="Where ops reaches the product. Same server: http://127.0.0.1:3000">
          <input id="baseUrl" name="baseUrl" required className={inputClass} placeholder="http://127.0.0.1:3000" />
        </Field>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={pending}>{pending ? "Registering…" : "Register product"}</Button>
        </div>
      </form>
      {state.error ? <p role="alert" className="mt-3 text-sm text-destructive">{state.error}</p> : null}
      {state.secrets ? <div className="mt-4"><SecretsPanel reveal={state} /></div> : null}
    </Card>
  );
}
