"use client";

import { Button, Card, Field, inputClass } from "@/components/ui";
import { RichEditor, type LibraryPicture } from "@/components/rich-editor";
import { useFormAction } from "@/lib/use-form-action";
import { SITE_LIMITS } from "@/modules/site-content/limits";
import {
  publishSiteAction, renameCategoryAction, saveAltAction, saveContactAction, saveLegalAction, savePostAction, saveNoticeAction, saveReleaseAction, type SiteFormState,
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

export function PostForm({ values, isNew, library }: { values: { slug: string; title: string; excerpt: string; date: string; author: string; tags: string; colourway: string; body: string; metaTitle: string; metaDescription: string; ogImage: string; status: string; publishAt: string }; isNew: boolean; library: LibraryPicture[] }) {
  const { state, onSubmit, pending } = useFormAction(savePostAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <div className="grid gap-4">
            <Field label="Title" htmlFor="title"><input id="title" name="title" maxLength={SITE_LIMITS.title} defaultValue={values.title} className={inputClass} /></Field>
            <Field label="Summary" htmlFor="excerpt" hint="Shown on the blog list."><textarea id="excerpt" name="excerpt" rows={2} maxLength={SITE_LIMITS.excerpt} defaultValue={values.excerpt} className={areaClass} /></Field>
            <RichEditor name="body" label="Post text" initial={values.body} library={library} />
          </div>
        </Card>
        <div className="grid content-start gap-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Publishing</h2>
            <div className="grid gap-4">
              <Field label="Status" htmlFor="status" hint="A draft is never put on the site."><select id="status" name="status" defaultValue={values.status} className={inputClass}><option value="PUBLISHED">Published</option><option value="DRAFT">Draft</option></select></Field>
              <Field label="Go live at" htmlFor="publishAt" hint="India time. Leave empty for the next publish. A later time schedules it."><input id="publishAt" name="publishAt" type="datetime-local" defaultValue={values.publishAt} className={inputClass} /></Field>
              <Field label="Date shown" htmlFor="date"><input id="date" name="date" type="date" defaultValue={values.date} className={inputClass} /></Field>
              <Field label="Address" htmlFor="slug" hint={isNew ? "Lower-case letters, numbers and hyphens. It becomes /blog/<address>/." : "Fixed once saved, so links keep working."}><input id="slug" name="slug" defaultValue={values.slug} readOnly={!isNew} className={inputClass} /></Field>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <div className="grid gap-4">
              <Field label="Author" htmlFor="author"><input id="author" name="author" maxLength={SITE_LIMITS.author} defaultValue={values.author} className={inputClass} /></Field>
              <Field label="Categories" htmlFor="tags" hint="Separate with commas. At most 6."><input id="tags" name="tags" defaultValue={values.tags} className={inputClass} /></Field>
              <Field label="Colour style" htmlFor="colourway"><select id="colourway" name="colourway" defaultValue={values.colourway} className={inputClass}>{["sunrise", "blossom", "citrus", "dusk"].map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Search and sharing</h2>
            <div className="grid gap-4">
              <Field label="Search title" htmlFor="metaTitle" hint="Shown by Google. Empty uses the post title."><input id="metaTitle" name="metaTitle" maxLength={SITE_LIMITS.metaTitle} defaultValue={values.metaTitle} className={inputClass} /></Field>
              <Field label="Search description" htmlFor="metaDescription" hint="About 150 characters. Empty uses the summary."><textarea id="metaDescription" name="metaDescription" rows={3} maxLength={SITE_LIMITS.metaDescription} defaultValue={values.metaDescription} className={areaClass} /></Field>
              <Field label="Share picture" htmlFor="ogImage" hint="Shown when the post is shared. Pick one from the library, or paste an https:// address."><input id="ogImage" name="ogImage" list="library-pictures" defaultValue={values.ogImage} className={inputClass} /></Field>
              <datalist id="library-pictures">{library.map((p) => <option key={p.name} value={p.name}>{p.alt}</option>)}</datalist>
            </div>
          </Card>
        </div>
      </div>
      <Feedback state={state} />
      <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : isNew ? "Add post" : "Save"}</Button></div>
    </form>
  );
}

export function LegalForm({ values, library }: { values: { slug: string; title: string; summary: string; updated: string; body: string }; library: LibraryPicture[] }) {
  const { state, onSubmit, pending } = useFormAction(saveLegalAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="slug" value={values.slug} />
      <Card>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label="Title" htmlFor="title"><input id="title" name="title" maxLength={SITE_LIMITS.title} defaultValue={values.title} className={inputClass} /></Field></div>
          <Field label="Last updated" htmlFor="updated" hint="Shown on the page as “Last updated”."><input id="updated" name="updated" type="date" defaultValue={values.updated} className={inputClass} /></Field>
          <div className="sm:col-span-2"><Field label="Summary" htmlFor="summary" hint="The line under the title."><textarea id="summary" name="summary" rows={2} maxLength={SITE_LIMITS.summary} defaultValue={values.summary} className={areaClass} /></Field></div>
          <div className="sm:col-span-2"><RichEditor name="body" label="Page text" initial={values.body} library={library} /></div>
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

export function AltForm({ name, alt }: { name: string; alt: string }) {
  const { state, onSubmit, pending } = useFormAction(saveAltAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-1.5">
      <input type="hidden" name="name" value={name} />
      <label htmlFor={`alt-${name}`} className="text-xs font-medium">Describe it (alt text)</label>
      <div className="flex gap-2"><input id={`alt-${name}`} name="alt" maxLength={200} defaultValue={alt} className={`${inputClass} h-9!`} /><Button type="submit" variant="outline" size="md" disabled={pending}>Save</Button></div>
      {state.error ? <p role="alert" className="text-xs text-destructive">{state.error}</p> : state.saved ? <p role="status" className="text-xs text-success">{state.saved}</p> : null}
    </form>
  );
}
