"use client";

import { Button, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { approveDeletionAction, declineDeletionAction, eraseDeletionAction, restoreDeletionAction, type DeletionFormState } from "./actions";

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

/** The final, irreversible removal. The staff member types the person's email first. */
export function EraseForm({ id, email }: { id: string; email: string }) {
  const erase = useFormAction(eraseDeletionAction, {});
  return (
    <form onSubmit={erase.onSubmit} className="mt-3 rounded-lg border border-destructive/40 p-3">
      <input type="hidden" name="id" value={id} />
      <p className="mb-2 text-sm text-muted-foreground">Erase now removes the business&apos;s data from every product, removes the person&apos;s account and sign-in records, and strips the contact details from invoices and payments (the invoices themselves are kept). It cannot be undone.</p>
      <Field label={`Type ${email} to confirm`} htmlFor={`erase-${id}`}>
        <input id={`erase-${id}`} name="confirmation" autoComplete="off" className={inputClass} />
      </Field>
      <div className="mt-2"><Button type="submit" size="md" variant="danger" disabled={erase.pending}>{erase.pending ? "Erasing…" : "Erase now"}</Button></div>
      <Result state={erase.state} />
    </form>
  );
}
