"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { NOTICE_LIMITS } from "@/modules/notices/limits";
import { publishNoticeAction, type NoticeFormState } from "./actions";

export interface NoticeValues {
  enabled: boolean;
  title: string;
  message: string;
  buttonLabel: string;
  buttonUrl: string;
}

export function NoticeForm({ productKey, productName, values }: { productKey: string; productName: string; values: NoticeValues }) {
  const { state, onSubmit, pending } = useFormAction(publishNoticeAction, {});
  // The saved notice shows read-only; "Edit" opens the form (the same pattern as Billing), so nothing is sent to every business by accident.
  const [editFrom, setEditFrom] = useState<NoticeFormState | null>(null);
  const editing = editFrom !== null && (editFrom === state || !!state.error);
  const shown = (label: string, value: string) => (
    <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="whitespace-pre-line">{value || "Not set"}</dd></div>
  );
  const heading = (
    <>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{productName} sidebar notice</h2>
        {editing ? null : <Button type="button" variant="outline" size="md" onClick={() => setEditFrom(state)}>Edit</Button>}
      </div>
      <p className="mb-4 text-sm text-muted-foreground">The box at the bottom of every {productName.toLowerCase()} kitchen&apos;s sidebar. Switched on, your text and button replace the trial countdown, including for paid kitchens. Switched off, kitchens see the trial countdown during their trial and nothing after.</p>
    </>
  );

  if (!editing) {
    return (
      <div className="grid gap-4">
        <Card>
          {heading}
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="sm:col-span-2">{shown("Show the notice", values.enabled ? "Yes" : "No")}</div>
            <div className="sm:col-span-2">{shown("Title", values.title)}</div>
            <div className="sm:col-span-2">{shown("Message", values.message)}</div>
            {shown("Button label", values.buttonLabel)}
            {shown("Button link", values.buttonUrl)}
          </dl>
        </Card>
        {state.saved ? <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{state.saved}</p> : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="productKey" value={productKey} />
      <Card>
        {heading}
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-medium sm:col-span-2"><input type="checkbox" name="enabled" defaultChecked={values.enabled} className="size-4 accent-[#ff6900]" /> Show the notice</label>
          <div className="sm:col-span-2"><Field label="Title" htmlFor={`title-${productKey}`}><input id={`title-${productKey}`} name="title" maxLength={NOTICE_LIMITS.title} defaultValue={values.title} className={inputClass} /></Field></div>
          <div className="sm:col-span-2"><Field label="Message" htmlFor={`message-${productKey}`}><textarea id={`message-${productKey}`} name="message" rows={3} maxLength={NOTICE_LIMITS.message} defaultValue={values.message} className={`${inputClass} h-auto py-2`} /></Field></div>
          <Field label="Button label" htmlFor={`buttonLabel-${productKey}`} hint="Optional."><input id={`buttonLabel-${productKey}`} name="buttonLabel" maxLength={NOTICE_LIMITS.buttonLabel} defaultValue={values.buttonLabel} className={inputClass} /></Field>
          <Field label="Button link" htmlFor={`buttonUrl-${productKey}`} hint="A page such as /subscribe, or an https:// address."><input id={`buttonUrl-${productKey}`} name="buttonUrl" maxLength={NOTICE_LIMITS.buttonUrl} defaultValue={values.buttonUrl} className={inputClass} /></Field>
        </div>
      </Card>
      {state.error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Save and send to every business"}</Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setEditFrom(null)}>Cancel</Button>
      </div>
    </form>
  );
}
