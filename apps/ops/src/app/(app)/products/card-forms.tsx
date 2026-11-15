"use client";

/* eslint-disable @next/next/no-img-element -- built-in pictures and library uploads are plain static files */
import { useState } from "react";
import { ABOUT_MAX, BUILTIN_CARD_IMAGES, FEATURE_ICONS, MAX_FEATURES, type ProductFeature } from "@platterly/contract";
import { useFormAction } from "@/lib/use-form-action";
import { Button, Field, inputClass } from "@/components/ui";
import { deleteUpcomingAction, saveLiveCardAction, saveUpcomingAction, type CardFormState } from "./actions";

export type LibraryPicture = { name: string; label: string };

/** Where a picture is shown from in Ops: a built-in file, or an upload from the library. */
export const pictureSrc = (ref: string | null) => (ref ? (ref.startsWith("builtin:") ? `/products/${ref.slice(8)}.svg` : `/uploads/${ref.slice(7)}`) : null);

/**
 * The picture of a card: keep the one it has, none, one of the built-in set, one already in the picture library, or a new upload (AJ, 2026-11-15: both options).
 * The choice travels as imageMode plus the field that mode needs; the server turns it into `builtin:<name>` or `upload:<file>`.
 */
function PictureField({ current, library, idPrefix }: { current: string | null; library: LibraryPicture[]; idPrefix: string }) {
  const [mode, setMode] = useState(current ? "keep" : "none");
  const [builtin, setBuiltin] = useState(current?.startsWith("builtin:") ? current.slice(8) : BUILTIN_CARD_IMAGES[0]);
  const shown = pictureSrc(current);
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">Picture on the card</legend>
      <input type="hidden" name="imageCurrent" value={current ?? ""} />
      <div className="flex flex-wrap items-center gap-4">
        {shown ? <img src={shown} alt="" className="h-16 w-20 rounded-lg bg-muted object-contain p-1" /> : <span className="flex h-16 w-20 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">No picture</span>}
        <select id={`${idPrefix}-mode`} name="imageMode" value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputClass} max-w-xs`} aria-label="Picture choice">
          {current ? <option value="keep">Keep the current picture</option> : null}
          <option value="none">No picture</option>
          <option value="builtin">A built-in picture</option>
          <option value="library">A picture from the library</option>
          <option value="upload">Upload a new picture</option>
        </select>
      </div>
      {mode === "builtin" ? (
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Built-in pictures">
          {BUILTIN_CARD_IMAGES.map((name) => (
            <label key={name} className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 text-xs ${builtin === name ? "border-primary bg-accent" : "border-border"}`}>
              <input type="radio" name="imageBuiltin" value={name} checked={builtin === name} onChange={() => setBuiltin(name)} className="sr-only" />
              <img src={`/products/${name}.svg`} alt="" className="h-14 w-[4.5rem] object-contain" />
              {name}
            </label>
          ))}
        </div>
      ) : null}
      {mode === "library" ? (
        library.length === 0 ? <p className="text-sm text-muted-foreground">The picture library is empty. Upload a picture instead.</p> : (
          <select name="imageLibrary" defaultValue={library[0].name} className={`${inputClass} max-w-md`} aria-label="Library picture">
            {library.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
          </select>
        )
      ) : null}
      {mode === "upload" ? (
        <div className="grid gap-1">
          <input type="file" name="imageFile" accept="image/png,image/jpeg,image/webp,image/gif" className="text-sm" aria-label="Picture file" />
          <p className="text-xs text-muted-foreground">PNG, JPG, WebP or GIF, up to 4 MB. It is added to the picture library.</p>
        </div>
      ) : null}
    </fieldset>
  );
}

/** The product's logo: shown in the tile on the Account. Required in practice: without one the tile shows the first letter of the name. */
function LogoField({ current, library }: { current: string | null; library: LibraryPicture[] }) {
  const [mode, setMode] = useState(current ? "keep" : "none");
  const shown = pictureSrc(current);
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">Product logo</legend>
      <input type="hidden" name="logoCurrent" value={current ?? ""} />
      <div className="flex flex-wrap items-center gap-4">
        {shown ? <img src={shown} alt="" className="size-12 rounded-lg bg-muted object-contain" /> : <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-xs text-muted-foreground">Letter</span>}
        <select name="logoMode" value={mode} onChange={(e) => setMode(e.target.value)} className={`${inputClass} max-w-xs`} aria-label="Logo choice">
          {current ? <option value="keep">Keep the current logo</option> : null}
          <option value="none">No logo (show the first letter)</option>
          <option value="library">A picture from the library</option>
          <option value="upload">Upload a new logo</option>
        </select>
      </div>
      {mode === "library" ? (
        library.length === 0 ? <p className="text-sm text-muted-foreground">The picture library is empty. Upload a logo instead.</p> : (
          <select name="logoLibrary" defaultValue={library[0].name} className={`${inputClass} max-w-md`} aria-label="Library logo">
            {library.map((m) => <option key={m.name} value={m.name}>{m.label}</option>)}
          </select>
        )
      ) : null}
      {mode === "upload" ? (
        <div className="grid gap-1">
          <input type="file" name="logoFile" accept="image/png,image/jpeg,image/webp,image/gif" className="text-sm" aria-label="Logo file" />
          <p className="text-xs text-muted-foreground">A square picture works best (PNG with a transparent background is ideal). It is added to the picture library.</p>
        </div>
      ) : null}
    </fieldset>
  );
}

function Status({ state }: { state: CardFormState }) {
  return (
    <>
      {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      {state.saved ? <p role="status" className="text-sm text-success">{state.saved}</p> : null}
    </>
  );
}

/** The "What you can do" items of a product's details page: up to four rows of icon, title and one sentence. A row left empty is not shown. */
function FeaturesField({ features }: { features: ProductFeature[] }) {
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-medium">What you can do (up to {MAX_FEATURES} items)</legend>
      {Array.from({ length: MAX_FEATURES }, (_, i) => {
        const f = features[i];
        return (
          <div key={i} className="grid gap-2 sm:grid-cols-[9rem_1fr_2fr]">
            <select name={`featureIcon${i}`} defaultValue={f?.icon ?? FEATURE_ICONS[i % FEATURE_ICONS.length]} className={inputClass} aria-label={`Item ${i + 1} icon`}>
              {FEATURE_ICONS.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
            </select>
            <input name={`featureTitle${i}`} maxLength={80} defaultValue={f?.title ?? ""} placeholder="Title" className={inputClass} aria-label={`Item ${i + 1} title`} />
            <input name={`featureText${i}`} maxLength={200} defaultValue={f?.text ?? ""} placeholder="One sentence" className={inputClass} aria-label={`Item ${i + 1} description`} />
          </div>
        );
      })}
    </fieldset>
  );
}

/** A live product: its one line, logo, picture and details page content. */
export function LiveCardForm({ productKey, tagline, cardImage, logo, about, features, library }: { productKey: string; tagline: string; cardImage: string | null; logo: string | null; about: string; features: ProductFeature[]; library: LibraryPicture[] }) {
  const { state, onSubmit, pending } = useFormAction(saveLiveCardAction, {});
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <input type="hidden" name="key" value={productKey} />
      <Field label="One line under the name" htmlFor={`live-${productKey}-tagline`} hint="Shown on every business's My Products page. A live product shows there once this line is filled in.">
        <input id={`live-${productKey}-tagline`} name="tagline" maxLength={300} defaultValue={tagline} className={inputClass} />
      </Field>
      <LogoField current={logo} library={library} />
      <PictureField current={cardImage} library={library} idPrefix={`live-${productKey}`} />
      <Field label="About (the details page)" htmlFor={`live-${productKey}-about`} hint={`A short paragraph shown under "About ${productKey}" on the product's details page. At most ${ABOUT_MAX} characters.`}>
        <textarea id={`live-${productKey}-about`} name="about" rows={3} maxLength={ABOUT_MAX} defaultValue={about} className={inputClass} />
      </Field>
      <FeaturesField features={features} />
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="md" disabled={pending}>{pending ? "Saving…" : "Save card"}</Button><Status state={state} /></div>
    </form>
  );
}

export interface UpcomingValues {
  key: string;
  name: string;
  tagline: string;
  cardImage: string | null;
  logo: string | null;
  /** `YYYY-MM-DDTHH:mm` in India time, or "". */
  launchAt: string;
  sortOrder: number;
  upcoming: boolean;
  visible: boolean;
}

/** An upcoming product: add a new one (create) or change one. The "Upcoming" switch is what staff turn off when the product goes live. */
export function UpcomingForm({ values, library, create = false }: { values: UpcomingValues; library: LibraryPicture[]; create?: boolean }) {
  const { state, onSubmit, pending } = useFormAction(saveUpcomingAction, {});
  const del = useFormAction(deleteUpcomingAction, {});
  const id = `up-${create ? "new" : values.key}`;
  return (
    <div className="grid gap-4">
      <form onSubmit={onSubmit} className="grid gap-4">
        <input type="hidden" name="mode" value={create ? "create" : "edit"} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Key" htmlFor={`${id}-key`} hint="Lowercase letters, digits and dashes. It cannot be changed later.">
            <input id={`${id}-key`} name="key" required readOnly={!create} defaultValue={values.key} className={`${inputClass} ${create ? "" : "bg-muted"}`} />
          </Field>
          <Field label="Name" htmlFor={`${id}-name`}><input id={`${id}-name`} name="name" required defaultValue={values.name} className={inputClass} /></Field>
          <div className="sm:col-span-2">
            <Field label="One line under the name" htmlFor={`${id}-tagline`}><input id={`${id}-tagline`} name="tagline" maxLength={300} defaultValue={values.tagline} className={inputClass} /></Field>
          </div>
          <Field label="Launch date and time (India time)" htmlFor={`${id}-launch`} hint="The card counts down to this. Leave blank for no countdown. Staff are notified when it arrives.">
            <input id={`${id}-launch`} name="launchAt" type="datetime-local" defaultValue={values.launchAt} className={inputClass} />
          </Field>
          <Field label="Order" htmlFor={`${id}-order`} hint="Lower numbers come first."><input id={`${id}-order`} name="sortOrder" type="number" min={0} max={9999} defaultValue={values.sortOrder} className={inputClass} /></Field>
        </div>
        <LogoField current={values.logo} library={library} />
        <PictureField current={values.cardImage} library={library} idPrefix={id} />
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="upcoming" defaultChecked={values.upcoming} className="size-4 accent-[#ff6900]" /> Upcoming product <span className="font-normal text-muted-foreground">(turn off when it goes live)</span></label>
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" name="visible" defaultChecked={values.visible} className="size-4 accent-[#ff6900]" /> Shown on the Account</label>
        </div>
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" size="md" disabled={pending}>{pending ? "Saving…" : create ? "Add product" : "Save"}</Button><Status state={state} /></div>
      </form>
      {create ? null : (
        <form onSubmit={del.onSubmit} className="flex flex-wrap items-center gap-3 border-t border-border pt-4" onClickCapture={(e) => { if ((e.target as HTMLElement).closest("button") && !window.confirm(`Delete ${values.name}? Its card disappears from every Account.`)) e.preventDefault(); }}>
          <input type="hidden" name="key" value={values.key} />
          <Button type="submit" variant="outline" size="md" disabled={del.pending}>Delete</Button>
          <Status state={del.state} />
        </form>
      )}
    </div>
  );
}
