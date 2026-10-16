"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ApprovalView } from "@/modules/menu-approvals/approval-view";
import { requestMenuChangesAction } from "../actions";
import { OrderNumberRow } from "./order-number-row";
import { ReviewMenuColumn } from "@/components/public/review-cards";
import { PriceSummary } from "./price-summary";

const PREFIXES = ["Event details: ", "Menu: "];


/**
 * The customer's "Review & Approve Your Menu" screen (REVIEW stage of the approval link): the event, the dishes by meal and the
 * add-ons on the left; the Price Summary with the Approve / Request Changes actions on the right (AJ, 2026-10-16). The Event
 * Overview "Edit" and the menu "Change" links open the same Request Changes box the button does, with a short prefix so the team
 * knows what the customer means: customers never edit the menu or the event themselves.
 */
export function ReviewScreen({ token, view, onApprove, orderNumber = null }: { token: string; view: ApprovalView; onApprove: () => void; orderNumber?: string | null }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"changes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const changesRef = useRef<HTMLDivElement>(null);

  function openChanges(prefix?: string) {
    setMode("changes");
    // A prefix only replaces an empty box or another untouched prefix; anything the customer typed stays.
    if (prefix && (note.trim() === "" || PREFIXES.includes(note))) setNote(prefix);
    setFocusTick((tick) => tick + 1);
  }

  // Once the box shows its (prefixed) text, put the cursor after it so typing continues the sentence instead of starting before it.
  useEffect(() => {
    if (focusTick === 0) return;
    const box = noteRef.current;
    if (!box) return;
    changesRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, [focusTick]);

  async function handleRequestChanges() {
    setPending("changes");
    setError(null);
    const result = await requestMenuChangesAction(token, note);
    setPending(null);
    if (!result.ok) return setError(result.error);
    setSent(true);
  }

  // A change request retires this version's link, so confirm here rather than refreshing into "no longer active".
  if (sent) {
    return (
      <div role="status" className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 rounded-xl bg-card p-8 text-center ring-1 ring-foreground/10">
        <span className="flex size-14 items-center justify-center rounded-full bg-info/10 text-info">
          <MessageSquareText className="size-8" />
        </span>
        <h2 className="text-xl font-semibold">Request sent — thank you!</h2>
        <p className="text-sm text-muted-foreground">We&apos;ll update the menu as you asked and send you a new version to approve.</p>
      </div>
    );
  }

  const actions = (
    <div className="flex flex-col gap-2">
      {mode === "idle" ? (
        <>
          <Button type="button" size="lg" disabled={pending !== null} onClick={onApprove}>
            Approve Menu
            <ArrowRight />
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={pending !== null} onClick={() => openChanges()}>
            <MessageSquareText />
            Request Changes
          </Button>
        </>
      ) : (
        <>
          <Button type="button" size="lg" disabled={pending !== null || note.trim() === ""} onClick={handleRequestChanges}>
            {pending === "changes" ? "Sending…" : "Submit Request"}
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={pending !== null} onClick={() => { setMode("idle"); setError(null); setNote(""); }}>
            Cancel
          </Button>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left: the event, the dishes and the add-ons */}
        <ReviewMenuColumn
          view={view}
          orderRow={<OrderNumberRow orderNumber={orderNumber} />}
          onEditEvent={() => openChanges("Event details: ")}
          onChangeMenu={() => openChanges("Menu: ")}
        />

        {/* Right: the final price and the decision, beside the menu on a wide screen */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <PriceSummary rows={view.priceRows} total={view.total}>
            {(mode === "changes" || error) && (
              <div ref={changesRef} className="flex flex-col gap-3">
                {mode === "changes" && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="approval-note">What would you like to change?</Label>
                    <Textarea id="approval-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replace Paneer Tikka with Malai Tikka" maxLength={2000} />
                    <p className="text-xs text-muted-foreground">Please describe the changes you&apos;d like us to make.</p>
                  </div>
                )}
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">After you approve, you&apos;ll add your venue and delivery details. Your approval is confirmed when you send them.</p>
            <div className="max-lg:hidden">{actions}</div>
          </PriceSummary>
        </div>
      </div>

      {/* On a phone only the actions stay on screen, so the menu above is never hidden behind a tall card. */}
      <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden [&>div]:flex-row-reverse [&_button]:flex-1">{actions}</div>


    </div>
  );
}

