"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateCustomerNotesAction } from "../actions";

/** The profile page's Notes box: type, Save note. Read-only (no button) for anyone who can't edit customers. */
export function CustomerNotes({ customerId, initialNotes, canEdit, idPrefix }: { customerId: string; initialNotes: string; canEdit: boolean; idPrefix: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = notes.trim() !== savedNotes.trim();

  async function handleSave() {
    setPending(true);
    setError(null);
    const result = await updateCustomerNotesAction(customerId, notes);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSavedNotes(notes);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <Label htmlFor={`${idPrefix}-notes`} className="sr-only">
        Notes
      </Label>
      <Textarea
        id={`${idPrefix}-notes`}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        readOnly={!canEdit}
        rows={5}
        placeholder="Add a note about this customer: preferences, allergies, how they found you…"
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="flex items-center justify-end gap-3">
          {!dirty && savedNotes.trim() !== "" && <span className="text-xs text-muted-foreground">Saved</span>}
          <Button type="button" size="md" disabled={pending || !dirty} onClick={handleSave}>
            {pending ? "Saving…" : "Save note"}
          </Button>
        </div>
      )}
    </div>
  );
}
