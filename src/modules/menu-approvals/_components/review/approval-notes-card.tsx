"use client";

import { MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AUTHOR_LABEL, AUTHOR_TONE, formatDateTime } from "./approval-format";
import type { ApprovalPending, NoteView } from "./types";

/** The note history (customer, kitchen and team, newest first) and the box to add a team note. */
export function ApprovalNotesCard({
  notes,
  noteDraft,
  onNoteDraftChange,
  pending,
  onAdd,
  canAdd = true,
}: {
  /** Oldest first, as stored; shown newest first. */
  notes: NoteView[];
  noteDraft: string;
  onNoteDraftChange: (value: string) => void;
  pending: ApprovalPending;
  onAdd: () => void;
  /** Only people who can act on the approval add notes; everyone who can see the card reads them. */
  canAdd?: boolean;
}) {
  const notesNewestFirst = [...notes].reverse();
  return (
    <Card id="menu-notes" className="scroll-mt-6 gap-4 px-5 [--card-spacing:--spacing(5)]" data-testid="menu-notes-card">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <MessageSquareText className="size-5" />
        </span>
        <h2 className="min-w-0 flex-1 text-base font-semibold">Notes</h2>
        <Badge variant="neutral">{notes.length}</Badge>
      </div>
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">{canAdd ? "No notes yet. Customer and kitchen requests land here, and you can add your own." : "No notes yet. Customer and kitchen requests land here."}</p>
      ) : (
        <ul className="flex max-h-96 flex-col gap-3 overflow-y-auto">
          {notesNewestFirst.map((note) => (
            <li key={note.id} className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm" data-testid="menu-note">
              <p className="whitespace-pre-wrap">{note.body}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant={AUTHOR_TONE[note.authorType]}>{AUTHOR_LABEL[note.authorType]}</Badge>
                {note.authorName && <span>{note.authorName}</span>}
                {note.versionNumber !== null && <span>· Version {note.versionNumber}</span>}
                <span>· {formatDateTime(note.createdAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="ma-add-note" className="sr-only">
            Add a note
          </Label>
          <Textarea id="ma-add-note" placeholder="Add a note for the team…" value={noteDraft} onChange={(e) => onNoteDraftChange(e.target.value)} />
          <Button type="button" variant="outline" size="md" className="self-end" disabled={pending !== null || noteDraft.trim() === ""} onClick={onAdd}>
            {pending === "note" ? "Adding…" : "Add Note"}
          </Button>
        </div>
      )}
    </Card>
  );
}
