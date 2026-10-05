"use client";

import { useFormAction } from "@/lib/use-form-action";
import type { EntitlementDef } from "@platterly/contract";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { savePlanAction } from "./actions";

export interface PlanFormValues {
  id?: string;
  code: string;
  name: string;
  description: string;
  isTrial: boolean;
  trialDurationDays: string;
  priceMonthly: string;
  priceAnnual: string;
  gstPercent: string;
  highlights: string;
  entitlements: Record<string, number | boolean | string | null>;
}

export function PlanForm({ productKey, productName, defs, values }: { productKey: string; productName: string; defs: EntitlementDef[]; values: PlanFormValues }) {
  const { state, onSubmit, pending } = useFormAction(savePlanAction, {});
  const editing = Boolean(values.id);
  return (
    <form onSubmit={onSubmit} className="grid gap-6">
      <input type="hidden" name="id" value={values.id ?? ""} />
      <input type="hidden" name="productKey" value={productKey} />
      <Card>
        <h2 className="mb-4 text-base font-semibold">Plan for {productName}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="name"><input id="name" name="name" required defaultValue={values.name} className={inputClass} /></Field>
          <Field label="Code" htmlFor="code" hint="Lowercase, unique within the product. Example: pro"><input id="code" name="code" required defaultValue={values.code} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Description" htmlFor="description"><input id="description" name="description" defaultValue={values.description} className={inputClass} /></Field></div>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="isTrial" defaultChecked={values.isTrial} className="size-4 accent-[#ff6900]" /> This is the trial plan</label>
          <Field label="Trial length (days)" htmlFor="trialDurationDays" hint="Only for a trial plan."><input id="trialDurationDays" name="trialDurationDays" type="number" min={1} max={365} defaultValue={values.trialDurationDays} className={inputClass} /></Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold">Pricing</h2>
        <p className="mb-4 text-sm text-muted-foreground">Prices are before GST. Leave a price empty if the plan is not sold that way.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly price (₹)" htmlFor="priceMonthly"><input id="priceMonthly" name="priceMonthly" type="number" min={0} step="0.01" defaultValue={values.priceMonthly} className={inputClass} /></Field>
          <Field label="Annual price (₹)" htmlFor="priceAnnual"><input id="priceAnnual" name="priceAnnual" type="number" min={0} step="0.01" defaultValue={values.priceAnnual} className={inputClass} /></Field>
          <Field label="GST (%)" htmlFor="gstPercent"><input id="gstPercent" name="gstPercent" type="number" min={0} max={100} step="0.01" defaultValue={values.gstPercent} className={inputClass} /></Field>
          <div className="sm:col-span-3">
            <Field label="Benefits shown to the owner" htmlFor="highlights" hint="One per line."><textarea id="highlights" name="highlights" rows={4} defaultValue={values.highlights} className={`${inputClass} h-auto py-2`} /></Field>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold">Entitlements</h2>
        <p className="mb-4 text-sm text-muted-foreground">What this plan allows. These come from the product&apos;s manifest. Leave a limit empty for unlimited.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          {defs.map((def) => {
            const current = values.entitlements[def.key];
            return def.type === "flag" ? (
              <label key={def.key} className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name={`ent:${def.key}`} defaultChecked={current === true} className="size-4 accent-[#ff6900]" /> {def.label}</label>
            ) : (
              <Field key={def.key} label={def.label} htmlFor={`ent:${def.key}`}>
                <input id={`ent:${def.key}`} name={`ent:${def.key}`} type={def.type === "limit" ? "number" : "text"} min={def.type === "limit" ? 0 : undefined} placeholder={def.type === "limit" ? "Unlimited" : ""} defaultValue={current === null || current === undefined ? "" : String(current)} className={inputClass} />
              </Field>
            );
          })}
        </div>
      </Card>

      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-success">{state.saved}</p> : null}
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save plan" : "Create plan"}</Button></div>
    </form>
  );
}
