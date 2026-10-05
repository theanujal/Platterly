"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, inputClass } from "@/components/ui";
import { assignPlanAction } from "../../plans/actions";

export function AssignForm({ businessId, productKey, plans, currentPlanId }: { businessId: string; productKey: string; plans: { id: string; label: string }[]; currentPlanId: string | null }) {
  const { state, onSubmit, pending } = useFormAction(assignPlanAction, {});
  if (plans.length === 0) return <p className="text-sm text-muted-foreground">No active plans for this product yet.</p>;
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="businessId" value={businessId} />
      <input type="hidden" name="productKey" value={productKey} />
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`plan-${productKey}`} className="text-sm font-medium">Assign a plan</label>
        <select id={`plan-${productKey}`} name="planId" defaultValue={currentPlanId ?? plans[0].id} className={`${inputClass} w-64`}>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <Button type="submit" size="md" disabled={pending}>{pending ? "Assigning…" : "Assign plan"}</Button>
      {state.error ? <p role="alert" className="w-full text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="w-full text-sm text-success">{state.saved}</p> : null}
    </form>
  );
}
