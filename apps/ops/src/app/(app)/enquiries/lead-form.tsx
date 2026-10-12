"use client";

import { Button, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { updateEnquiryAction } from "./actions";

export function LeadForm({ id, status, note }: { id: string; status: "NEW" | "CONTACTED" | "CLOSED"; note: string }) {
  const { state, onSubmit, pending } = useFormAction(updateEnquiryAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={id} />
      <Field label="Status" htmlFor={`status-${id}`}>
        <select id={`status-${id}`} name="status" defaultValue={status} className={`${inputClass} w-36`}>
          <option value="NEW">New</option>
          <option value="CONTACTED">Contacted</option>
          <option value="CLOSED">Closed</option>
        </select>
      </Field>
      <div className="min-w-56 flex-1">
        <Field label="Note" htmlFor={`note-${id}`}>
          <input id={`note-${id}`} name="note" maxLength={2000} defaultValue={note} placeholder="Who spoke to them, what was agreed" className={inputClass} />
        </Field>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>{pending ? "Saving…" : "Save"}</Button>
      {state.saved ? <p role="status" className="text-sm text-success">Saved.</p> : null}
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}
