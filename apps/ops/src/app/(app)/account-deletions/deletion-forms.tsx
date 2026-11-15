"use client";

import { Button, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { approveDeletionAction, declineDeletionAction, restoreDeletionAction, type DeletionFormState } from "./actions";

function Result({ state }: { state: DeletionFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      {state.done ? <p role="status" className="mt-2 text-sm text-success">{state.done}</p> : null}
    </>
  );
}

/** Approve (suspends the business, restorable for 30 days) or decline with a reason the person is sent. */
export function DecideForms({ id, hasBusiness }: { id: string; hasBusiness: boolean }) {
  const approve = useFormAction(approveDeletionAction, {});
  const decline = useFormAction(declineDeletionAction, {});
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      <form onSubmit={approve.onSubmit}>
        <input type="hidden" name="id" value={id} />
        <p className="mb-2 text-sm text-muted-foreground">{hasBusiness ? "Approving suspends the business in every product and blocks the person's sign-in. It can be restored for 30 days." : "Approving blocks the person's sign-in. It can be restored for 30 days."}</p>
        <Button type="submit" size="md" variant="danger" disabled={approve.pending}>{approve.pending ? "Approving…" : "Approve deletion"}</Button>
        <Result state={approve.state} />
      </form>
      <form onSubmit={decline.onSubmit}>
        <input type="hidden" name="id" value={id} />
        <Field label="Reason for declining (sent to the person)" htmlFor={`reason-${id}`}>
          <input id={`reason-${id}`} name="reason" maxLength={500} className={inputClass} />
        </Field>
        <div className="mt-2"><Button type="submit" size="md" variant="outline" disabled={decline.pending}>Decline</Button></div>
        <Result state={decline.state} />
      </form>
    </div>
  );
}

export function RestoreForm({ id }: { id: string }) {
  const restore = useFormAction(restoreDeletionAction, {});
  return (
    <form onSubmit={restore.onSubmit} className="mt-3">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="md" variant="outline" disabled={restore.pending}>{restore.pending ? "Restoring…" : "Restore the business and account"}</Button>
      <Result state={restore.state} />
    </form>
  );
}
