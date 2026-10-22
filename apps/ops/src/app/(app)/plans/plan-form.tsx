"use client";

import { useState } from "react";
import { useFormAction } from "@/lib/use-form-action";
import type { EntitlementDef } from "@platterly/contract";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { savePlanAction, type PlanFormState } from "./actions";

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
  isFeatured: boolean;
  /** Whether the plan is active (a new plan is). A retired plan cannot be featured. */
  isActive: boolean;
  entitlements: Record<string, number | boolean | string | null>;
}

export function PlanForm({ productKey, productName, defs, values, otherFeatured, businessesOnPlan = 0, trialNote = null }: { productKey: string; productName: string; defs: EntitlementDef[]; values: PlanFormValues; /** The product's featured plan when it is not this one. */ otherFeatured: string | null; /** Businesses whose current subscription is this plan. */ businessesOnPlan?: number; /** Whether new sign-ups get this trial plan (null when it isn't a trial plan). */ trialNote?: string | null }) {
  const { state, onSubmit, pending } = useFormAction(savePlanAction, {});
  const editing = Boolean(values.id);
  const [isTrial, setIsTrial] = useState(values.isTrial);
  const [monthly, setMonthly] = useState(values.priceMonthly);
  const [featured, setFeatured] = useState(values.isFeatured);
  const eligible = values.isActive && !isTrial && monthly.trim() !== "";
  const featuredHint = !values.isActive ? "A retired plan cannot be featured." : isTrial ? "The trial plan cannot be featured." : monthly.trim() === "" ? "Set a monthly price to feature this plan." : null;
  // A saved plan shows read-only; "Edit" opens the form (the same pattern as Billing). The answer current when Edit was clicked is
  // kept, so a newer answer that saved closes the form again, and one with an error leaves it open with what was typed.
  const [editFrom, setEditFrom] = useState<PlanFormState | null>(null);
  const open = !editing || (editFrom !== null && (editFrom === state || !!state.error));
  const startEdit = () => {
    setIsTrial(values.isTrial);
    setMonthly(values.priceMonthly);
    setFeatured(values.isFeatured);
    setEditFrom(state);
  };
  const shown = (label: string, value: string) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-line">{value || "Not set"}</dd></div>
  );
  const rupees = (value: string) => (value.trim() === "" ? "Not sold" : `₹${Number(value).toLocaleString("en-IN")} + ${values.gstPercent}% GST`);

  if (!open) {
    return (
      <div className="grid gap-6">
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Plan for {productName}</h2>
            <Button type="button" variant="outline" size="md" onClick={startEdit}>Edit</Button>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {shown("Name", values.name)}
            {shown("Code", values.code)}
            <div className="sm:col-span-2">{shown("Description", values.description)}</div>
            {shown("Trial plan", values.isTrial ? `Yes, ${values.trialDurationDays || "?"} days` : "No")}
          </dl>
          {values.isTrial && trialNote ? <p className="mt-3 text-sm text-muted-foreground" data-testid="trial-note">{trialNote}</p> : null}
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold">Pricing</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {shown("Monthly", rupees(values.priceMonthly))}
            {shown("Yearly", rupees(values.priceAnnual))}
            {shown("Most popular on the website", values.isFeatured ? "Yes" : "No")}
            <div className="sm:col-span-3">{shown("Benefits shown to the owner", values.highlights)}</div>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-4 text-base font-semibold">Entitlements</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            {defs.map((def) => {
              const v = values.entitlements[def.key];
              return <div key={def.key}>{shown(def.label, def.type === "flag" ? (v === true ? "Yes" : "No") : v === null || v === undefined || v === "" ? (def.type === "limit" ? "Unlimited" : "") : String(v))}</div>;
            })}
          </dl>
        </Card>
        {state.saved ? <p role="status" className="text-sm text-success">{state.saved}</p> : null}
      </div>
    );
  }

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
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="isTrial" checked={isTrial} onChange={(e) => setIsTrial(e.target.checked)} className="size-4 accent-[#ff6900]" /> This is the trial plan</label>
          {isTrial && trialNote ? <p className="text-sm text-muted-foreground sm:col-span-2" data-testid="trial-note">{trialNote}</p> : null}
          {values.isTrial && !isTrial && businessesOnPlan > 0 ? (
            <p className="rounded-md bg-warning/10 p-3 text-sm text-warning sm:col-span-2" data-testid="trial-off-warning">
              {businessesOnPlan === 1 ? "1 business is" : `${businessesOnPlan} businesses are`} on this plan. Their current trial keeps its end date, but anyone assigned this plan from now on gets it as an active plan with no end date, so every feature it allows is free for as long as they stay on it.
            </p>
          ) : null}
          <Field label="Trial length (days)" htmlFor="trialDurationDays" hint="Only for a trial plan."><input id="trialDurationDays" name="trialDurationDays" type="number" min={1} max={365} defaultValue={values.trialDurationDays} className={inputClass} /></Field>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-base font-semibold">Pricing</h2>
        <p className="mb-4 text-sm text-muted-foreground">Prices are before GST. Leave a price empty if the plan is not sold that way.</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Monthly price (₹)" htmlFor="priceMonthly"><input id="priceMonthly" name="priceMonthly" type="number" min={0} step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputClass} /></Field>
          <Field label="Annual price (₹)" htmlFor="priceAnnual"><input id="priceAnnual" name="priceAnnual" type="number" min={0} step="0.01" defaultValue={values.priceAnnual} className={inputClass} /></Field>
          <Field label="GST (%)" htmlFor="gstPercent"><input id="gstPercent" name="gstPercent" type="number" min={0} max={100} step="0.01" defaultValue={values.gstPercent} className={inputClass} /></Field>
          <div className="sm:col-span-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="isFeatured" checked={eligible && featured} disabled={!eligible} onChange={(e) => setFeatured(e.target.checked)} className="size-4 accent-[#ff6900]" /> Most popular on the website
            </label>
            <p className="mt-1 text-xs text-muted-foreground" data-testid="featured-hint">
              {featuredHint ?? (featured && otherFeatured ? `This replaces ${otherFeatured} as the featured plan.` : "Marks this plan's card on platterly.in. Only one plan can be featured.")}
            </p>
          </div>
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
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : editing ? "Save plan" : "Create plan"}</Button>
        {editing ? <Button type="button" variant="outline" disabled={pending} onClick={() => setEditFrom(null)}>Cancel</Button> : null}
      </div>
    </form>
  );
}
