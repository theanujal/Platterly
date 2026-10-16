"use client";

import { useState } from "react";
import { MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SummaryCard } from "@/app/(app)/orders/_components/order-form-parts";
import { AUTHOR_LABEL, AUTHOR_TONE, formatDateTime } from "./approval-format";
import type { ApprovalPending, NoteView } from "./types";

function NoteItem({ note }: { note: NoteView }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm" data-testid="menu-note">
      <p className="whitespace-pre-wrap">{note.body}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant={AUTHOR_TONE[note.authorType]}>{AUTHOR_LABEL[note.authorType]}</Badge>
        {note.authorName && <span>{note.authorName}</span>}
        {note.versionNumber !== null && <span>· Version {note.versionNumber}</span>}
        <span>· {formatDateTime(note.createdAt)}</span>
      </div>
    </li>
  );
}

/** "Team Notes": the latest note (customer, kitchen or team) and "Add Note", which opens the box; "View all notes" lists every one, newest first. */
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
  onAdd: () => Promise<boolean>;
  /** Only people who can act on the approval add notes; everyone who can see the card reads them. */
  canAdd?: boolean;
}) {
  const [composing, setComposing] = useState(false);
  const [allOpen, setAllOpen] = useState(false);
  const notesNewestFirst = [...notes].reverse();
  const latest = notesNewestFirst[0];
  return (
    <SummaryCard
      icon={MessageSquareText}
      title="Team Notes"
      description="Internal notes"
      action={
        canAdd ? (
          <Button type="button" variant="ghost" size="sm" className="text-primary" aria-expanded={composing} onClick={() => setComposing((on) => !on)}>
            {composing ? "Close" : "+ Add Note"}
          </Button>
        ) : undefined
      }
    >
      <div id="menu-notes" className="flex scroll-mt-6 flex-col gap-3" data-testid="menu-notes-card">
        {composing && canAdd && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="ma-add-note" className="sr-only">
              Add a note
            </Label>
            <Textarea id="ma-add-note" placeholder="Add a note for the team…" value={noteDraft} onChange={(e) => onNoteDraftChange(e.target.value)} />
            <Button
              type="button"
              variant="outline"
              size="md"
              className="self-end"
              disabled={pending !== null || noteDraft.trim() === ""}
              onClick={async () => {
                if (await onAdd()) setComposing(false);
              }}
            >
              {pending === "note" ? "Adding…" : "Save Note"}
            </Button>
          </div>
        )}
        {latest ? (
          <ul className="flex flex-col gap-3">
            <NoteItem note={latest} />
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{canAdd ? "No notes added yet." : "No notes yet. Customer and kitchen requests land here."}</p>
        )}
        {notes.length > 1 && (
          <Button type="button" variant="link" size="sm" className="w-fit px-0 text-info" onClick={() => setAllOpen(true)}>
            View all notes ({notes.length})
          </Button>
        )}
      </div>
      <Dialog open={allOpen} onOpenChange={setAllOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>All notes</DialogTitle>
            <DialogDescription>Customer, kitchen and team notes, newest first.</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto" data-testid="menu-notes-all">
            {notesNewestFirst.map((note) => (
              <NoteItem key={note.id} note={note} />
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </SummaryCard>
  );
}
