"use client";

import { Button, Card, Field, inputClass } from "@/components/ui";
import { useFormAction } from "@/lib/use-form-action";
import { SITE_LIMITS } from "@/modules/site-content/limits";
import {
  publishSiteAction, renameCategoryAction, saveContactAction, saveLegalAction, savePostAction, saveNoticeAction, saveReleaseAction, type SiteFormState,
} from "./actions";

const areaClass = `${inputClass} h-auto py-2`;

function Feedback({ state }: { state: SiteFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">{state.saved}</p> : null}
    </>
  );
}

export function NoticeForm({ values }: { values: { enabled: boolean; text: string; linkLabel: string; linkHref: string } }) {
  const { state, onSubmit, pending } = useFormAction(saveNoticeAction, {});
  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
      <Card>
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="enabled" defaultChecked={values.enabled} className="size-4 accent-[#ff6900]" /> Show the bar</label>
          <Field label="Message" htmlFor="text"><textarea id="text" name="text" rows={2} maxLength={SITE_LIMITS.noticeText} defaultValue={values.text} className={areaClass} /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link label" htmlFor="linkLabel" hint="Optional."><input id="linkLabel" name="linkLabel" maxLength={SITE_LIMITS.noticeLinkLabel} defaultValue={values.linkLabel} className={inputClass} /></Field>
            <Field label="Link address" htmlFor="linkHref" hint="A page such as /catering/, or an https:// address."><input id="linkHref" name="linkHref" maxLength={SITE_LIMITS.noticeLinkHref} defaultValue={values.linkHref} className={inputClass} /></Field>
          </div>
        </div>
      </Card>
      <Feedback state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  );
}

export function ContactForm({ values }: { values: { email: string; phone: string; whatsapp: string; hours: string; addressLines: string; reply: string } }) {
  const { state, onSubmit, pending } = useFormAction(saveContactAction, {});
  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" htmlFor="email"><input id="email" name="email" type="email" defaultValue={values.email} className={inputClass} /></Field>
          <Field label="Reply time" htmlFor="reply" hint="Shown on the contact forms."><input id="reply" name="reply" maxLength={SITE_LIMITS.reply} defaultValue={values.reply} className={inputClass} /></Field>
          <Field label="Phone" htmlFor="phone" hint="Leave empty to hide it."><input id="phone" name="phone" defaultValue={values.phone} className={inputClass} /></Field>
          <Field label="WhatsApp" htmlFor="whatsapp" hint="Leave empty to hide it."><input id="whatsapp" name="whatsapp" defaultValue={values.whatsapp} className={inputClass} /></Field>
          <Field label="Address" htmlFor="addressLines" hint="One line per row."><textarea id="addressLines" name="addressLines" rows={3} defaultValue={values.addressLines} className={areaClass} /></Field>
          <Field label="Opening hours" htmlFor="hours" hint="One line per row, such as “Mon to Fri, 9 to 6”. Leave empty to hide."><textarea id="hours" name="hours" rows={3} defaultValue={values.hours} className={areaClass} /></Field>
        </div>
      </Card>
      <Feedback state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  );
}

export function ReleaseForm({ values, isNew }: { values: { id: string; date: string; title: string; body: string; kind: string }; isNew: boolean }) {
  const { state, onSubmit, pending } = useFormAction(saveReleaseAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor={`id-${values.id}`} hint={isNew ? "Lower-case letters, numbers and hyphens, such as 2026-10-08-reports." : "Fixed once saved."}><input id={`id-${values.id}`} name="id" defaultValue={values.id} readOnly={!isNew} className={inputClass} /></Field>
          <Field label="Date" htmlFor={`date-${values.id}`}><input id={`date-${values.id}`} name="date" type="date" defaultValue={values.date} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Title" htmlFor={`title-${values.id}`}><input id={`title-${values.id}`} name="title" maxLength={SITE_LIMITS.title} defaultValue={values.title} className={inputClass} /></Field></div>
          <div className="sm:col-span-2"><Field label="Text" htmlFor={`body-${values.id}`}><textarea id={`body-${values.id}`} name="body" rows={3} maxLength={SITE_LIMITS.releaseBody} defaultValue={values.body} className={areaClass} /></Field></div>
          <Field label="Kind" htmlFor={`kind-${values.id}`}><select id={`kind-${values.id}`} name="kind" defaultValue={values.kind} className={inputClass}><option value="new">New</option><option value="improved">Improved</option></select></Field>
        </div>
      </Card>
      <Feedback state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : isNew ? "Add" : "Save"}</Button></div>
    </form>
  );
}

export function PostForm({ values, isNew }: { values: { slug: string; title: string; excerpt: string; date: string; author: string; tags: string; colourway: string; body: string }; isNew: boolean }) {
  const { state, onSubmit, pending } = useFormAction(savePostAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address" htmlFor="slug" hint={isNew ? "Lower-case letters, numbers and hyphens. It becomes /blog/<address>/." : "Fixed once saved, so links keep working."}><input id="slug" name="slug" defaultValue={values.slug} readOnly={!isNew} className={inputClass} /></Field>
          <Field label="Date" htmlFor="date"><input id="date" name="date" type="date" defaultValue={values.date} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Title" htmlFor="title"><input id="title" name="title" maxLength={SITE_LIMITS.title} defaultValue={values.title} className={inputClass} /></Field></div>
          <div className="sm:col-span-2"><Field label="Summary" htmlFor="excerpt" hint="Shown on the blog list."><textarea id="excerpt" name="excerpt" rows={2} maxLength={SITE_LIMITS.excerpt} defaultValue={values.excerpt} className={areaClass} /></Field></div>
          <Field label="Author" htmlFor="author"><input id="author" name="author" maxLength={SITE_LIMITS.author} defaultValue={values.author} className={inputClass} /></Field>
          <Field label="Categories" htmlFor="tags" hint="Separate with commas. At most 6."><input id="tags" name="tags" defaultValue={values.tags} className={inputClass} /></Field>
          <Field label="Colour style" htmlFor="colourway"><select id="colourway" name="colourway" defaultValue={values.colourway} className={inputClass}>{["sunrise", "blossom", "citrus", "dusk"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
          <div className="sm:col-span-2"><Field label="Post text" htmlFor="body" hint="Markdown: ## for headings, - for lists, **bold**."><textarea id="body" name="body" rows={18} defaultValue={values.body} className={`${areaClass} font-mono`} /></Field></div>
        </div>
      </Card>
      <Feedback state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : isNew ? "Add post" : "Save"}</Button></div>
    </form>
  );
}

export function LegalForm({ values }: { values: { slug: string; title: string; summary: string; updated: string; body: string } }) {
  const { state, onSubmit, pending } = useFormAction(saveLegalAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="slug" value={values.slug} />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Title" htmlFor="title"><input id="title" name="title" maxLength={SITE_LIMITS.title} defaultValue={values.title} className={inputClass} /></Field></div>
          <Field label="Last updated" htmlFor="updated" hint="Shown on the page as “Last updated”."><input id="updated" name="updated" type="date" defaultValue={values.updated} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Summary" htmlFor="summary" hint="The line under the title."><textarea id="summary" name="summary" rows={2} maxLength={SITE_LIMITS.summary} defaultValue={values.summary} className={areaClass} /></Field></div>
          <div className="sm:col-span-2"><Field label="Page text" htmlFor="body" hint="Markdown: ## for headings, - for lists, **bold**."><textarea id="body" name="body" rows={24} defaultValue={values.body} className={`${areaClass} font-mono`} /></Field></div>
        </div>
      </Card>
      <Feedback state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save"}</Button></div>
    </form>
  );
}

export function RenameCategoryForm({ tag }: { tag: string }) {
  const { state, onSubmit, pending } = useFormAction(renameCategoryAction, {});
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="from" value={tag} />
      <input name="to" aria-label={`Rename ${tag}`} defaultValue={tag} maxLength={SITE_LIMITS.tag} className={`${inputClass} max-w-52`} />
      <Button type="submit" size="md" variant="outline" disabled={pending}>Rename</Button>
      <Button type="submit" size="md" variant="danger" disabled={pending} onClick={(e) => { (e.currentTarget.form!.elements.namedItem("to") as HTMLInputElement).value = ""; }}>Remove</Button>
      {state.error ? <span role="alert" className="text-sm text-destructive">{state.error}</span> : null}
      {state.saved ? <span role="status" className="text-sm text-success">{state.saved}</span> : null}
    </form>
  );
}

export function PublishButton({ disabled }: { disabled: boolean }) {
  const { state, onSubmit, pending } = useFormAction(async () => publishSiteAction(), {} as SiteFormState);
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div><Button type="submit" disabled={pending || disabled}>{pending ? "Starting…" : "Publish to the site"}</Button></div>
      <Feedback state={state} />
    </form>
  );
}
