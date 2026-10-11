"use client";

import { useState, useTransition } from "react";
import type { LibraryEntryDoc } from "@platterly/contract";
import { LIBRARY_FOOD_CATEGORIES, LIBRARY_INGREDIENT_CATEGORIES, LIBRARY_UNITS } from "@platterly/contract";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { entryAction, type ReviewState } from "./actions";

/** One library entry: a summary line, with Edit opening its fields and Hide / Show switching whether kitchens can pick it. */
export function EntryRow({ productKey, e, categoryNames }: { productKey: string; e: LibraryEntryDoc; categoryNames?: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<ReviewState>({});
  const [pending, startTransition] = useTransition();
  const food = e.kind === "FOOD_ITEM";
  const category = e.kind === "CATEGORY";

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(async () => {
      const result = await entryAction(state, formData);
      setState(result);
      if (result.done) setOpen(false);
    });
  }

  return (
    <li data-testid="library-entry" className="px-5 py-3 text-sm">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="productKey" value={productKey} />
        <input type="hidden" name="id" value={e.id} />
        <input type="hidden" name="kind" value={e.kind} />
        <input type="hidden" name="label" value={e.name} />
        <div className="flex flex-wrap items-center gap-3">
          <span className={`font-medium ${e.isActive ? "" : "text-muted-foreground line-through"}`}>{e.name}</span>
          {category ? <span className="text-muted-foreground">{e.aliases.length > 0 ? `Also called: ${e.aliases.join(", ")}` : "No other names"}</span> : <span className="text-muted-foreground">{e.categoryName}{food ? (e.foodType === "NON_VEGETARIAN" ? " · Non-Veg" : " · Veg") : ` · ${e.unit}`}</span>}
          {e.isActive ? null : <Badge tone="warning">Hidden</Badge>}
          <span className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" size="md" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Close" : "Edit"}</Button>
            {category ? null : <Button type="submit" name="intent" value={e.isActive ? "hide" : "show"} variant="outline" size="md" disabled={pending}>{e.isActive ? "Hide" : "Show"}</Button>}
          </span>
        </div>
        {open ? (
          <div className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Field label="Name" htmlFor={`n-${e.id}`}>
                <input id={`n-${e.id}`} name="name" required defaultValue={e.name} className={inputClass} />
              </Field>
              {category ? null : (
                <>
              <Field label="Category" htmlFor={`c-${e.id}`}>
                {food && categoryNames ? (
                  <select id={`c-${e.id}`} name="categoryName" required defaultValue={e.categoryName} className={inputClass}>
                    {categoryNames.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                ) : food ? (
                  <>
                    <input id={`c-${e.id}`} name="categoryName" list={`cl-${e.id}`} required defaultValue={e.categoryName} className={inputClass} />
                    <datalist id={`cl-${e.id}`}>{LIBRARY_FOOD_CATEGORIES.map((x) => <option key={x} value={x} />)}</datalist>
                  </>
                ) : (
                  <select id={`c-${e.id}`} name="categoryName" defaultValue={e.categoryName} className={inputClass}>
                    {LIBRARY_INGREDIENT_CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                )}
              </Field>
              {food ? (
                <Field label="Veg / Non-Veg" htmlFor={`t-${e.id}`}>
                  <select id={`t-${e.id}`} name="foodType" defaultValue={e.foodType ?? "VEGETARIAN"} className={inputClass}>
                    <option value="VEGETARIAN">Veg</option>
                    <option value="NON_VEGETARIAN">Non-Veg</option>
                  </select>
                </Field>
              ) : (
                <Field label="Unit (a suggestion; the kitchen confirms)" htmlFor={`u-${e.id}`}>
                  <select id={`u-${e.id}`} name="unit" defaultValue={e.unit ?? "kg"} className={inputClass}>
                    {LIBRARY_UNITS.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Description" htmlFor={`d-${e.id}`}>
                <input id={`d-${e.id}`} name="description" maxLength={500} defaultValue={e.description ?? ""} className={inputClass} />
              </Field>
                </>
              )}
            </div>
            <Field label="Other names (comma separated)" htmlFor={`a-${e.id}`} hint="Names kitchens use for the same item. They are used only to recognise it.">
              <input id={`a-${e.id}`} name="aliases" defaultValue={e.aliases.join(", ")} className={inputClass} />
            </Field>
            <p className="text-xs text-muted-foreground">{category ? "Renaming moves every library dish in it. Kitchens' own categories never change. The old name stays as another name." : "Kitchens that already added this keep their own copy unchanged. Renaming keeps the old name as an other name."}</p>
            <div className="flex items-center gap-2">
              <Button type="submit" name="intent" value="save" size="md" disabled={pending}>Save changes</Button>
            </div>
          </div>
        ) : null}
        {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      </form>
    </li>
  );
}
