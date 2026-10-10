"use client";

import { useState, useTransition } from "react";
import { LIBRARY_FOOD_CATEGORIES, LIBRARY_INGREDIENT_CATEGORIES, LIBRARY_UNITS } from "@platterly/contract";
import { Badge, Button, Field, inputClass } from "@/components/ui";
import { reviewAction, type ReviewState } from "./actions";

export interface CandidateView {
  id: string;
  kind: string;
  name: string;
  categoryName: string | null;
  foodType: string | null;
  unit: string | null;
  kitchenCount: number;
  suggestedMatchId: string | null;
  suggestedMatchName: string | null;
}

/** One candidate: the reviewer may correct the fields, then approve it as a new library entry, merge it into the item it looks like, or reject it. */
export function CandidateForm({ c }: { c: CandidateView }) {
  const [state, setState] = useState<ReviewState>({});
  const [pending, startTransition] = useTransition();
  const food = c.kind === "FOOD_ITEM";

  // The button that was pressed says what to do (approve, merge or reject): its name and value join the form data.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(async () => setState(await reviewAction(state, formData)));
  }

  return (
    <form onSubmit={onSubmit} data-testid="library-candidate" className="flex flex-col gap-4 rounded-[14px] bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)]">
      <input type="hidden" name="id" value={c.id} />
      <input type="hidden" name="mergeIntoId" value={c.suggestedMatchId ?? ""} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{c.kitchenCount} kitchens</Badge>
        <Badge tone="neutral">{food ? "Dish" : "Ingredient"}</Badge>
        {c.suggestedMatchName ? <Badge tone="warning">Looks like: {c.suggestedMatchName}</Badge> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Name" htmlFor={`name-${c.id}`}>
          <input id={`name-${c.id}`} name="name" required defaultValue={c.name} className={inputClass} />
        </Field>
        <Field label="Category" htmlFor={`cat-${c.id}`}>
          {food ? (
            <>
              <input id={`cat-${c.id}`} name="categoryName" list={`cats-${c.id}`} required defaultValue={c.categoryName ?? ""} className={inputClass} />
              <datalist id={`cats-${c.id}`}>{LIBRARY_FOOD_CATEGORIES.map((x) => <option key={x} value={x} />)}</datalist>
            </>
          ) : (
            <select id={`cat-${c.id}`} name="categoryName" defaultValue={c.categoryName ?? "Other"} className={inputClass}>
              {LIBRARY_INGREDIENT_CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          )}
        </Field>
        {food ? (
          <Field label="Veg / Non-Veg" htmlFor={`type-${c.id}`}>
            <select id={`type-${c.id}`} name="foodType" defaultValue={c.foodType ?? ""} className={inputClass}>
              <option value="">Choose…</option>
              <option value="VEGETARIAN">Veg</option>
              <option value="NON_VEGETARIAN">Non-Veg</option>
            </select>
          </Field>
        ) : (
          <Field label="Unit" htmlFor={`unit-${c.id}`}>
            <select id={`unit-${c.id}`} name="unit" defaultValue={c.unit ?? "kg"} className={inputClass}>
              {LIBRARY_UNITS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
        )}
        <Field label="Description (optional)" htmlFor={`desc-${c.id}`}>
          <input id={`desc-${c.id}`} name="description" maxLength={500} className={inputClass} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" name="intent" value="approve" size="md" disabled={pending}>Approve as new</Button>
        {c.suggestedMatchId ? <Button type="submit" name="intent" value="merge" variant="outline" size="md" disabled={pending}>Merge into “{c.suggestedMatchName}”</Button> : null}
        <Button type="submit" name="intent" value="reject" variant="outline" size="md" disabled={pending}>Reject</Button>
        {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
      </div>
    </form>
  );
}
