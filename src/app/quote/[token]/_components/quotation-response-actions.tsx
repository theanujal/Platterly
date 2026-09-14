"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { acceptQuotationAction, rejectQuotationAction, requestQuotationChangesAction } from "../actions";

export function QuotationResponseActions({ token }: { token: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject" | "changes">("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setPending("accept");
    setError(null);
    const result = await acceptQuotationAction(token);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleReject() {
    setPending("reject");
    setError(null);
    const result = await rejectQuotationAction(token, message);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  async function handleRequestChanges() {
    setPending("changes");
    setError(null);
    const result = await requestQuotationChangesAction(token, message);
    setPending(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.refresh();
  }

  if (mode === "reject" || mode === "changes") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="quotation-message">{mode === "reject" ? "Let them know why (optional)" : "What would you like changed?"}</Label>
          <Textarea id="quotation-message" value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mode === "reject" ? "destructive" : "default"}
            disabled={pending !== null}
            onClick={mode === "reject" ? handleReject : handleRequestChanges}
          >
            {pending ? "Sending…" : mode === "reject" ? "Confirm Reject" : "Send Request"}
          </Button>
          <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending !== null} onClick={handleAccept}>
          {pending === "accept" ? "Accepting…" : "Accept Quotation"}
        </Button>
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setMode("changes")}>
          Request Changes
        </Button>
        <Button type="button" variant="outline" disabled={pending !== null} onClick={() => setMode("reject")}>
          Reject
        </Button>
      </div>
    </div>
  );
}
