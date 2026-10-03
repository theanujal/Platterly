"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { addCustomerNoteAction, deleteCustomerNoteAction, updateCustomerNoteAction, type ActionResult } from "../actions";

export interface NoteRow {
  id: string;
  body: string;
  authorName: string;
  /** ISO string, so the row can cross the server/client line. */
  createdAt: string;
  updatedAt: string;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  const day = date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

/**
 * The profile page's Notes: dated entries, newest first, each with its author, and an "Add Note" box (AJ, 2026-09-30).
 * Anyone who can edit customers can add, edit and delete; everyone else only reads. `limit` shows the latest few in the
 * sidebar card, the Notes tab shows them all.
 */
export function CustomerNotes({ customerId, notes, canEdit, idPrefix, limit }: { customerId: string; notes: NoteRow[]; canEdit: boolean; idPrefix: string; limit?: number }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = limit ? notes.slice(0, limit) : notes;

  async function run(key: string, task: () => Promise<ActionResult>, after?: () => void) {
    setPending(key);
    setError(null);
    const result = await task();
    setPending(null);
    if (!result.ok) return setError(result.error);
    after?.();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {canEdit && (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-note-new`} className="sr-only">
            New note
          </Label>
          <Textarea id={`${idPrefix}-note-new`} value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2000} placeholder="Add a note: preferences, allergies, how they found you…" />
          <div className="flex justify-end">
            <Button type="button" size="md" disabled={pending !== null || draft.trim() === ""} onClick={() => run("add", () => addCustomerNoteAction(customerId, draft), () => setDraft(""))}>
              <Plus />
              {pending === "add" ? "Adding…" : "Add Note"}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {shown.length === 0 && <p className="text-sm text-muted-foreground">No notes yet.</p>}
      <ul className="flex flex-col gap-3" data-testid={`${idPrefix}-notes-list`}>
        {shown.map((note) => (
          <li key={note.id} className="flex flex-col gap-1.5 rounded-lg border border-border p-3" data-testid="customer-note">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{note.authorName}</span> · {formatWhen(note.createdAt)}
                {note.updatedAt !== note.createdAt && new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000 && " · edited"}
              </span>
              {canEdit && editingId !== note.id && (
                <span className="flex shrink-0 gap-1">
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit note" onClick={() => { setEditingId(note.id); setEditDraft(note.body); }}>
                    <Pencil />
                  </Button>
                  <Button type="button" variant="ghost" size="icon-sm" aria-label="Delete note" disabled={pending !== null} onClick={() => run(`del-${note.id}`, () => deleteCustomerNoteAction(customerId, note.id))}>
                    <Trash2 />
                  </Button>
                </span>
              )}
            </div>
            {editingId === note.id ? (
              <div className="flex flex-col gap-2">
                <Textarea aria-label="Edit note" value={editDraft} onChange={(e) => setEditDraft(e.target.value)} rows={3} maxLength={2000} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="md" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                  <Button type="button" size="md" disabled={pending !== null || editDraft.trim() === ""} onClick={() => run(`edit-${note.id}`, () => updateCustomerNoteAction(customerId, note.id, editDraft), () => setEditingId(null))}>
                    {pending === `edit-${note.id}` ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm whitespace-pre-line">{note.body}</p>
            )}
          </li>
        ))}
      </ul>
      {limit && notes.length > limit && <p className="text-xs text-muted-foreground">Showing the latest {limit} of {notes.length}. All of them are in the Notes tab.</p>}
    </div>
  );
}
