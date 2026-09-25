"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInr } from "@/lib/format-currency";
import type { DraftQuote } from "@/modules/menu-approvals/storefront-draft";
import { submitDraftAction } from "../actions";

export interface ReviewSummary {
  customerName: string;
  phone: string;
  eventTypeName: string;
  eventDate: string;
  mealType: string;
  menuPreferenceLabel: string;
  guests: number;
  childBelow5Count: number;
  child5To10Count: number;
  itemNames: string[];
  venueLine: string;
}

interface ReviewStepProps {
  tenantSlug: string;
  draftId: string;
  summary: ReviewSummary;
  quote: DraftQuote;
}

export function ReviewStep({ tenantSlug, draftId, summary, quote }: ReviewStepProps) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit() {
    setError(null);
    setPending(true);
    const result = await submitDraftAction(tenantSlug, draftId, notes);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    // The plan page renders the confirmation once the draft is COMPLETED.
    router.push(`/${tenantSlug}/plan/${draftId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">Review Your Request</h2>
        <p className="text-sm text-muted-foreground">Check everything below, then submit. Our team reviews it and follows up with you.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Event</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Row label="Name" value={summary.customerName} />
          <Row label="Phone" value={summary.phone} />
          <Row label="Event Type" value={summary.eventTypeName} />
          <Row label="Date" value={summary.eventDate} />
          <Row label="Event Time" value={summary.mealType} />
          <Row label="Preference" value={summary.menuPreferenceLabel} />
          <Row label="Guests" value={String(summary.guests)} />
          <Row label="Kids" value={`${summary.childBelow5Count} (0–5) · ${summary.child5To10Count} (5–10)`} />
          <div className="sm:col-span-2">
            <Row label="Venue" value={summary.venueLine} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{quote.isCustomMenu ? "Custom Menu" : (quote.menuName ?? "Menu")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <p className="text-muted-foreground" data-testid="review-items">
            {summary.itemNames.join(", ")}
          </p>

          <div className="flex flex-col gap-2 border-t border-border pt-3" data-testid="review-pricing">
            {quote.isCustomMenu ? (
              <p className="rounded-lg bg-muted p-3 text-muted-foreground">
                Since this is a personalised menu, our team will confirm the price per plate after reviewing your selection.
              </p>
            ) : (
              <Line label={`Menu — ${formatInr(quote.pricePerPlate ?? 0)} × ${quote.guests} guests`} amount={quote.menuAmount} />
            )}
            {quote.childrenCharge > 0 && <Line label="Kids charges" amount={quote.childrenCharge} />}
            {quote.extras.map((extra) => (
              <Line key={extra.id} label={`Extra: ${extra.name} — ${formatInr(extra.price)} × ${quote.guests}`} amount={extra.amount} />
            ))}
            {quote.addOns.map((addOn) => (
              <Line
                key={addOn.id}
                label={`Add-on: ${addOn.name}${addOn.priceType === "PER_PLATE" ? ` — ${formatInr(addOn.price)} × ${quote.guests}` : ""}`}
                amount={addOn.amount}
              />
            ))}
            <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
              <span>{quote.isCustomMenu ? "Total so far (excl. menu price)" : "Estimated Total"}</span>
              <span data-testid="review-total">{formatInr(quote.total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="rv-notes">Anything else we should know? (Optional)</Label>
        <Textarea id="rv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Jain options for a few guests, or a call before finalising" />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-between gap-3">
        <Button type="button" variant="outline" onClick={() => router.push(`/${tenantSlug}/plan/${draftId}?step=venue`)}>
          <ArrowLeft /> Back
        </Button>
        <Button type="button" disabled={pending} onClick={handleSubmit}>
          {pending ? "Submitting…" : "Submit Request"}
          <Send />
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Line({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span>{formatInr(amount)}</span>
    </div>
  );
}
