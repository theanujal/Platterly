"use client";

import { useState } from "react";
import { CircleCheck, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { approveMenuAction, requestMenuChangesAction } from "../actions";

export function ApprovalActions({ token }: { token: string }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"approve" | "changes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "changes" | null>(null);

  async function handleApprove() {
    setPending("approve");
    setError(null);
    const result = await approveMenuAction(token);
    setPending(null);
    if (!result.ok) return setError(result.error);
    setDone("approved");
  }

  async function handleRequestChanges() {
    setPending("changes");
    setError(null);
    const result = await requestMenuChangesAction(token, note);
    setPending(null);
    if (!result.ok) return setError(result.error);
    setDone("changes");
  }

  // The link stops working the moment it's used, so confirm here rather than
  // refreshing into the neutral "no longer active" page.
  if (done) {
    return (
      <div role="status" className="flex flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
        <span className={done === "approved" ? "flex size-14 items-center justify-center rounded-full bg-success/10 text-success" : "flex size-14 items-center justify-center rounded-full bg-info/10 text-info"}>
          {done === "approved" ? <CircleCheck className="size-8" /> : <MessageSquareText className="size-8" />}
        </span>
        <h2 className="text-xl font-semibold">{done === "approved" ? "Menu approved — thank you!" : "Request sent — thank you!"}</h2>
        <p className="text-sm text-muted-foreground">
          {done === "approved"
            ? "We've received your approval and will take it from here."
            : "We'll update the menu as you asked and send you a new version to approve."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {mode === "changes" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="approval-note">What would you like to change?</Label>
          <Textarea
            id="approval-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Replace Paneer Tikka with Malai Tikka"
            maxLength={2000}
          />
          <p className="text-xs text-muted-foreground">Please describe the changes you&apos;d like us to make.</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {mode === "idle" ? (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setMode("changes")}>
              Request Changes
            </Button>
            <Button type="button" disabled={pending !== null} onClick={handleApprove}>
              {pending === "approve" ? "Approving…" : "Approve Menu"}
            </Button>
          </>
        ) : (
          <>
            <Button type="button" variant="outline" disabled={pending !== null} onClick={() => { setMode("idle"); setError(null); }}>
              Cancel
            </Button>
            <Button type="button" disabled={pending !== null || note.trim() === ""} onClick={handleRequestChanges}>
              {pending === "changes" ? "Sending…" : "Submit Request"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
