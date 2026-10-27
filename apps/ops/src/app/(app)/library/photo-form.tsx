"use client";

import { useState, useTransition } from "react";
import { Badge, Button } from "@/components/ui";
import { reviewAction, type ReviewState } from "./actions";

export interface PhotoView {
  id: string;
  name: string;
  categoryName: string | null;
  kitchenCount: number;
  photoUrl: string | null;
}

/** A kitchen's picture offered as a library dish's picture. Approving needs the reviewer to confirm they looked at it. */
export function PhotoForm({ c }: { c: PhotoView }) {
  const [state, setState] = useState<ReviewState>({});
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) formData.set(submitter.name, submitter.value);
    startTransition(async () => setState(await reviewAction(state, formData)));
  }

  return (
    <form onSubmit={onSubmit} data-testid="library-photo" className="flex flex-col gap-4 rounded-[14px] bg-card p-5 shadow-[0_0_0_1px_rgba(17,24,39,0.1)] sm:flex-row">
      <input type="hidden" name="id" value={c.id} />
      {c.photoUrl ? (
        // The picture is the product's own file, shown as it is: not optimised, not cached by Ops.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.photoUrl} alt={`A kitchen's photo of ${c.name}`} loading="lazy" className="h-44 w-full rounded-lg bg-muted object-cover sm:w-72" />
      ) : (
        <div className="flex h-44 w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground sm:w-72">No picture</div>
      )}
      <div className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{c.name}</span>
          {c.categoryName ? <Badge tone="neutral">{c.categoryName}</Badge> : null}
          <Badge tone="info">{c.kitchenCount} {c.kitchenCount === 1 ? "kitchen has" : "kitchens have"} a photo</Badge>
        </div>
        <p className="text-sm text-muted-foreground">This dish has only an illustration in the library. If you approve, this picture becomes the dish&apos;s picture for every kitchen that adds it from now on. Kitchens that already added it keep theirs.</p>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="checked" value="yes" className="mt-0.5 h-4 w-4" />
          <span>I looked at this photo: it shows this dish, is clear, and has no people, logos or text. Fine to share with every kitchen.</span>
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" name="intent" value="approvePhoto" size="md" disabled={pending}>Use this photo</Button>
          <Button type="submit" name="intent" value="reject" variant="outline" size="md" disabled={pending}>Reject</Button>
          {state.error ? <p role="alert" className="text-sm text-destructive">{state.error}</p> : null}
        </div>
      </div>
    </form>
  );
}
