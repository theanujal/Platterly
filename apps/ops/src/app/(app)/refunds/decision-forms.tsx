"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, Field, inputClass } from "@/components/ui";
import { approveRefundAction, declineRefundAction } from "./actions";

/** Approve (amount with GST, and what happens to the plan) or decline (with a note the owner is told) one refund request. */
export function DecisionForms({ requestId, max }: { requestId: string; max: number }) {
  const approve = useFormAction(approveRefundAction, {});
  const decline = useFormAction(declineRefundAction, {});
  const busy = approve.pending || decline.pending;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={approve.onSubmit} className="grid gap-3" aria-label="Approve refund">
        <input type="hidden" name="requestId" value={requestId} />
        <Field label="Refund amount (with GST)" htmlFor={`total-${requestId}`} hint={`Up to ₹${max.toLocaleString("en-IN", { maximumFractionDigits: 2 })}, what is left of this payment.`}>
          <input id={`total-${requestId}`} name="total" type="number" step="0.01" min="0.01" max={max} defaultValue={max} className={inputClass} required />
        </Field>
        <fieldset className="grid gap-1 text-sm">
          <legend className="mb-1 font-medium">The plan</legend>
          <label className="flex items-center gap-2"><input type="radio" name="endMode" value="END_NOW" required /> End it now (the kitchen locks)</label>
          <label className="flex items-center gap-2"><input type="radio" name="endMode" value="KEEP_TO_PERIOD_END" /> Keep it to the end of the paid days, no renewal</label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy}>{approve.pending ? "Refunding…" : "Approve and refund"}</Button>
          {approve.state.error ? <p role="alert" className="text-sm text-destructive">{approve.state.error}</p> : null}
          {approve.state.done ? <p role="status" className="text-sm text-success">Refunded. Credit note {approve.state.done}.</p> : null}
        </div>
      </form>
      <form onSubmit={decline.onSubmit} className="grid gap-3" aria-label="Decline refund">
        <input type="hidden" name="requestId" value={requestId} />
        <Field label="Note to the owner (optional)" htmlFor={`note-${requestId}`} hint="It is sent in the email telling them the request was declined.">
          <textarea id={`note-${requestId}`} name="note" rows={3} maxLength={500} className={inputClass} />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={busy}>{decline.pending ? "Declining…" : "Decline"}</Button>
          {decline.state.error ? <p role="alert" className="text-sm text-destructive">{decline.state.error}</p> : null}
        </div>
      </form>
    </div>
  );
}
