"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/public/form-section";
import { ReviewMenuColumn } from "@/components/public/review-cards";
import type { ApprovalView } from "@/modules/menu-approvals/approval-view";
import { PriceSummary } from "@/app/menu-approval/[token]/_components/price-summary";
import { acceptQuotationAction, rejectQuotationAction, requestQuotationChangesAction } from "../actions";

const PREFIXES = ["Event details: ", "Menu: "];

/**
 * The customer's quotation, in the same design as Review & Approve (AJ, 2026-10-17): the event, the dishes by meal and the add-ons
 * on the left, the Price Summary with Accept / Request Changes / Reject on the right. The Event Overview "Edit" and menu "Change"
 * links open the Request Changes box with a short prefix, as on the approval page. Once answered, the actions give way to the status.
 */
export function QuotationReview({
  token,
  view,
  validUntil,
  pastValidity,
  terms,
  actionable,
  statusMessage,
}: {
  token: string;
  view: ApprovalView;
  /** "5 Nov 2026", or null when the quotation has no end date. */
  validUntil: string | null;
  pastValidity: boolean;
  terms: string | null;
  actionable: boolean;
  /** What to say instead of the actions when the quotation was already answered or expired. */
  statusMessage: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"idle" | "reject" | "changes">("idle");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"accept" | "reject" | "changes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  function openChanges(prefix?: string) {
    setMode("changes");
    // A prefix only replaces an empty box or another untouched prefix; anything the customer typed stays.
    if (prefix && (message.trim() === "" || PREFIXES.includes(message))) setMessage(prefix);
    setFocusTick((tick) => tick + 1);
  }

  useEffect(() => {
    if (focusTick === 0) return;
    const box = boxRef.current;
    if (!box) return;
    box.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
  }, [focusTick]);

  async function run(kind: "accept" | "reject" | "changes") {
    setPending(kind);
    setError(null);
    const result = kind === "accept" ? await acceptQuotationAction(token) : kind === "reject" ? await rejectQuotationAction(token, message) : await requestQuotationChangesAction(token, message);
    setPending(null);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const busy = pending !== null;
  const actions =
    mode === "idle" ? (
      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" disabled={busy} onClick={() => run("accept")}>
          {pending === "accept" ? "Accepting…" : "Accept Quotation"}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => openChanges()}>
            Request Changes
          </Button>
          <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => { setMode("reject"); setError(null); }}>
            Reject
          </Button>
        </div>
      </div>
    ) : (
      <div className="flex flex-col gap-2">
        <Button type="button" size="lg" variant={mode === "reject" ? "destructive" : "default"} disabled={busy || (mode === "changes" && message.trim() === "")} onClick={() => run(mode)}>
          {busy ? "Sending…" : mode === "reject" ? "Confirm Reject" : "Send Request"}
        </Button>
        <Button type="button" size="lg" variant="outline" disabled={busy} onClick={() => { setMode("idle"); setError(null); setMessage(""); }}>
          Cancel
        </Button>
      </div>
    );

  const validity = validUntil ? (
    <div className="flex items-center gap-3 rounded-lg bg-accent/60 px-4 py-3 text-sm" data-testid="quotation-valid-until">
      <CalendarClock className="size-4 shrink-0 text-primary" />
      <span>
        Valid until <span className="font-medium">{validUntil}</span>
        {pastValidity && <span className="text-muted-foreground"> · this quotation has passed its validity date</span>}
      </span>
    </div>
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <ReviewMenuColumn
          view={view}
          onEditEvent={actionable ? () => openChanges("Event details: ") : undefined}
          onChangeMenu={actionable ? () => openChanges("Menu: ") : undefined}
          eventExtra={validity}
        >
          {terms && (
            <FormCard className="gap-2 md:p-5">
              <h2 className="text-[15px] font-semibold">Terms</h2>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{terms}</p>
            </FormCard>
          )}
        </ReviewMenuColumn>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4">
          <PriceSummary
            rows={view.priceRows}
            total={view.total}
            footnote={
              <div className="flex items-start gap-3 rounded-lg bg-muted p-3 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">{validUntil ? `This quotation is valid until ${validUntil}. Prices may change after this date.` : "Prices may change if the event details change."}</p>
              </div>
            }
          >
            {actionable ? (
              <>
                {(mode !== "idle" || error) && (
                  <div className="flex flex-col gap-3">
                    {mode !== "idle" && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="quotation-message">{mode === "reject" ? "Let them know why (optional)" : "What would you like changed?"}</Label>
                        <Textarea id="quotation-message" ref={boxRef} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
                      </div>
                    )}
                    {error && (
                      <p role="alert" className="text-sm text-destructive">
                        {error}
                      </p>
                    )}
                  </div>
                )}
                <div className="max-lg:hidden">{actions}</div>
              </>
            ) : (
              statusMessage && (
                <p className="rounded-lg bg-muted p-3 text-center text-sm text-muted-foreground" data-testid="quotation-status-message">
                  {statusMessage}
                </p>
              )
            )}
          </PriceSummary>
        </div>
      </div>

      {/* On a phone only the actions stay on screen, as on Review & Approve. */}
      {actionable && <div className="sticky bottom-0 z-10 -mx-4 border-t border-border bg-card/95 p-3 backdrop-blur lg:hidden">{actions}</div>}
    </div>
  );
}
