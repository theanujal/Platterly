"use client";

import { Button, Card, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { deleteBusinessAction, providerAction, reactivateBusinessAction, restoreBusinessAction, suspendBusinessAction, updateBusinessAction, type BusinessFormState } from "../actions";

function Result({ state }: { state: BusinessFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="mt-2 text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="mt-2 text-sm text-success">{state.saved}</p> : null}
    </>
  );
}

const hidden = (businessId: string, productKey: string) => (
  <>
    <input type="hidden" name="businessId" value={businessId} />
    <input type="hidden" name="productKey" value={productKey} />
  </>
);

/** Identity: leave a field blank to keep it as it is. The product decides whether the change is allowed (a taken link, a bad format). */
export function IdentityForm({ businessId, productKey, name, ownerName, ownerEmail, hasSlug }: { businessId: string; productKey: string; name: string; ownerName: string; ownerEmail: string; hasSlug: boolean }) {
  const { state, onSubmit, pending } = useFormAction(updateBusinessAction, {});
  const id = (field: string) => `${field}-${productKey}`;
  return (
    <form onSubmit={onSubmit}>
      {hidden(businessId, productKey)}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Business name" htmlFor={id("name")}><input id={id("name")} name="name" defaultValue={name} maxLength={200} className={inputClass} /></Field>
        <Field label="Owner's name" htmlFor={id("ownerName")}><input id={id("ownerName")} name="ownerName" defaultValue={ownerName} maxLength={200} className={inputClass} /></Field>
        <Field label="Owner's email" htmlFor={id("ownerEmail")}><input id={id("ownerEmail")} name="ownerEmail" type="email" defaultValue={ownerEmail} className={inputClass} /></Field>
        <Field label="Phone" htmlFor={id("contactPhone")}><input id={id("contactPhone")} name="contactPhone" className={inputClass} /></Field>
        {hasSlug ? <Field label="Public link" htmlFor={id("slug")} hint="Letters, numbers, - and _, up to 20. Blank keeps the current one."><input id={id("slug")} name="slug" maxLength={20} className={inputClass} /></Field> : null}
      </div>
      <div className="mt-3"><Button type="submit" size="md" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button></div>
      <Result state={state} />
    </form>
  );
}

export function ProviderButtons({ businessId, productKey }: { businessId: string; productKey: string }) {
  const { state, onSubmit, pending } = useFormAction(providerAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      {hidden(businessId, productKey)}
      <Field label="Message provider" htmlFor={`channel-${productKey}`}>
        <select id={`channel-${productKey}`} name="channel" className={`${inputClass} w-40`}><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
      </Field>
      <Field label="Set to" htmlFor={`connected-${productKey}`}>
        <select id={`connected-${productKey}`} name="connected" className={`${inputClass} w-40`}><option value="1">Connected</option><option value="0">Disconnected</option></select>
      </Field>
      <Button type="submit" size="md" variant="outline" disabled={pending}>Apply</Button>
      <div className="w-full"><Result state={state} /></div>
    </form>
  );
}

/** Suspend, reactivate, delete and restore, shown according to the business's status. */
export function StatusControls({ businessId, productKey, businessName, status, deleteAfter }: { businessId: string; productKey: string; businessName: string; status: "ACTIVE" | "SUSPENDED" | "PENDING_DELETE"; deleteAfter: string | null }) {
  const suspend = useFormAction(suspendBusinessAction, {});
  const reactivate = useFormAction(reactivateBusinessAction, {});
  const del = useFormAction(deleteBusinessAction, {});
  const restore = useFormAction(restoreBusinessAction, {});
  return (
    <Card className="grid gap-5">
      {status === "ACTIVE" ? (
        <form onSubmit={suspend.onSubmit} className="flex flex-wrap items-end gap-2">
          {hidden(businessId, productKey)}
          <div className="min-w-64 flex-1"><Field label="Suspend" htmlFor={`reason-${productKey}`} hint="The business cannot sign in until it is reactivated. The reason is kept in the audit log."><input id={`reason-${productKey}`} name="reason" required placeholder="Reason" className={inputClass} /></Field></div>
          <Button type="submit" size="md" variant="outline" disabled={suspend.pending}>Suspend</Button>
          <div className="w-full"><Result state={suspend.state} /></div>
        </form>
      ) : null}
      {status === "SUSPENDED" ? (
        <form onSubmit={reactivate.onSubmit}>
          {hidden(businessId, productKey)}
          <p className="mb-2 text-sm text-muted-foreground">This business is suspended.</p>
          <Button type="submit" size="md" disabled={reactivate.pending}>Reactivate</Button>
          <Result state={reactivate.state} />
        </form>
      ) : null}
      {status === "PENDING_DELETE" ? (
        <form onSubmit={restore.onSubmit}>
          {hidden(businessId, productKey)}
          <p className="mb-2 text-sm text-muted-foreground">Marked for deletion{deleteAfter ? ` on ${deleteAfter}` : ""}. It is suspended and can be restored until then. Nothing has been removed, and nothing is removed automatically.</p>
          <Button type="submit" size="md" disabled={restore.pending}>Restore</Button>
          <Result state={restore.state} />
        </form>
      ) : null}
      {status !== "PENDING_DELETE" ? (
        <form onSubmit={del.onSubmit} className="flex flex-wrap items-end gap-2 border-t pt-4">
          {hidden(businessId, productKey)}
          <div className="min-w-64 flex-1"><Field label="Delete" htmlFor={`confirm-${productKey}`} hint={`Type "${businessName}" to confirm. It is suspended now and can be restored for 30 days.`}><input id={`confirm-${productKey}`} name="confirmation" required autoComplete="off" className={inputClass} /></Field></div>
          <Button type="submit" size="md" variant="danger" disabled={del.pending}>Delete</Button>
          <div className="w-full"><Result state={del.state} /></div>
        </form>
      ) : null}
    </Card>
  );
}
