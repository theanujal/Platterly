"use client";

import { useFormAction } from "@/lib/use-form-action";
import { Button, Field, inputClass } from "@/components/ui";
import { advanceStandOrderAction } from "../actions";

export function AdvanceForm({ id, label, asksNote }: { id: string; label: string; asksNote: boolean }) {
  const { state, onSubmit, pending } = useFormAction(advanceStandOrderAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
      <input type="hidden" name="id" value={id} />
      {asksNote ? (
        <Field label="Delivery note (courier, tracking number)" htmlFor="tracking-note" hint="Shown to the kitchen in the shipped email. Optional.">
          <input id="tracking-note" name="trackingNote" maxLength={300} className={inputClass} />
        </Field>
      ) : null}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : label}</Button>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
