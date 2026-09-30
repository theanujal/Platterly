"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Sparkles, X } from "lucide-react";
import { StepFooter } from "@/components/public/step-footer";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/public/form-section";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInr } from "@/lib/format-currency";
import type { DraftQuote } from "@/modules/menu-approvals/storefront-draft";
import { saveAddOnsAction, saveItemsAction, submitDraftAction } from "../actions";

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
  /** The dishes inside the menu, by category. Extras are listed separately. */
  selectedSections: { categoryName: string; items: string[] }[];
  /** Extra dishes with the category each sits in. */
  extraCategories: Record<string, string>;
  itemIds: string[];
  addOnIds: string[];
  venueLine: string;
  /** When the summary was produced, already formatted (server-side, so it never mismatches on hydration). */
  placedAt: string;
}

interface ReviewStepProps {
  tenantSlug: string;
  draftId: string;
  summary: ReviewSummary;
  quote: DraftQuote;
}

/**
 * Step 6: what the customer chose, laid out like a receipt (AJ, 2026-10-01): the selection on the left, the order
 * summary with the running total on the right. Extras and add-ons can be removed here; the dishes inside the menu
 * can't (the category minimums are set on the Choose Items step).
 */
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

  async function removeExtra(id: string) {
    setError(null);
    setPending(true);
    const result = await saveItemsAction(tenantSlug, draftId, summary.itemIds.filter((x) => x !== id));
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function removeAddOn(id: string) {
    setError(null);
    setPending(true);
    const result = await saveAddOnsAction(tenantSlug, draftId, summary.addOnIds.filter((x) => x !== id));
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  const mealsSuffix = quote.meals > 1 ? ` × ${quote.meals} meals` : "";
  const extrasTotal = quote.extras.reduce((sum, e) => sum + e.amount, 0);
  const addOnsTotal = quote.addOns.reduce((sum, a) => sum + a.amount, 0);
  const liveCounters = quote.addOns.filter((a) => a.type === "LIVE_COUNTER");
  const specialAddOns = quote.addOns.filter((a) => a.type !== "LIVE_COUNTER");
  const nothingExtra = quote.extras.length === 0 && quote.addOns.length === 0;

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Review Your Request</h2>
        <p className="text-sm text-muted-foreground">Check everything below, then submit. Our team reviews it and follows up with you.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <FormCard className="gap-5">
            <h3 className="text-xl font-semibold">Selected Menu Items</h3>
            <div className="flex flex-col gap-4" data-testid="review-items">
              {summary.selectedSections.length === 0 && <p className="text-sm text-muted-foreground">No dishes selected.</p>}
              {summary.selectedSections.map((section) => (
                <div key={section.categoryName} className="flex flex-col gap-1">
                  <h4 className="text-base font-semibold text-primary">{section.categoryName}</h4>
                  <p className="text-sm">{section.items.join(", ")}</p>
                </div>
              ))}
            </div>
          </FormCard>

          <FormCard className="gap-5">
            <h3 className="text-xl font-semibold">Add-ons &amp; Live Counters</h3>
            {nothingExtra && <p className="text-sm text-muted-foreground">No extra dishes, add-ons or live counters selected.</p>}

            {quote.extras.length > 0 && (
              <div className="flex flex-col gap-3">
                <h4 className="flex items-center gap-2 text-base font-semibold text-info">
                  <Sparkles className="size-4" /> Extra Menu Items
                </h4>
                {quote.extras.map((extra) => (
                  <div key={extra.id} data-testid="review-extra" className="flex items-center gap-3 rounded-xl bg-info/10 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{extra.name}</span>
                      {summary.extraCategories[extra.id] && <span className="text-sm text-muted-foreground">{summary.extraCategories[extra.id]}</span>}
                      <span className="text-xs text-muted-foreground">
                        {formatInr(extra.price)} × {quote.guests} guests{mealsSuffix}
                      </span>
                    </div>
                    <span className="font-semibold text-primary">{formatInr(extra.amount)}</span>
                    <RemoveButton label={`Remove ${extra.name}`} disabled={pending} onClick={() => removeExtra(extra.id)} />
                  </div>
                ))}
              </div>
            )}

            {quote.addOns.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <h4 className="text-base font-semibold">Live Counters &amp; Services</h4>
                {[...liveCounters, ...specialAddOns].map((addOn) => (
                  <div key={addOn.id} data-testid="review-addon" className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold">{addOn.name}</span>
                      {!addOn.included && addOn.priceType === "PER_PLATE" && (
                        <span className="text-xs text-muted-foreground">
                          {formatInr(addOn.price)} × {quote.guests} guests{mealsSuffix}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold text-primary">{addOn.included ? "Included" : formatInr(addOn.amount)}</span>
                    <RemoveButton label={`Remove ${addOn.name}`} disabled={pending} onClick={() => removeAddOn(addOn.id)} />
                  </div>
                ))}
              </div>
            )}
          </FormCard>

          <FormCard className="gap-3">
            <Label htmlFor="rv-notes" className="text-base font-semibold">
              Additional Notes (Optional)
            </Label>
            <Textarea id="rv-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Jain options for a few guests, or a call before finalising" />
          </FormCard>
        </div>

        <FormCard className="gap-5 lg:sticky lg:top-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h3 className="text-xl font-semibold">Order Summary</h3>
            <p className="text-sm text-muted-foreground">{summary.placedAt}</p>
          </div>

          <dl className="flex flex-col gap-2 border-y border-dashed border-border py-4 text-sm">
            <SummaryRow label="Customer" value={summary.customerName} />
            <SummaryRow label="Phone" value={summary.phone} />
            <SummaryRow label="Event Type" value={summary.eventTypeName} />
            <SummaryRow label="Event Date" value={summary.eventDate} />
            <SummaryRow label="Meals Required" value={summary.mealType} />
            <SummaryRow label="Preference" value={summary.menuPreferenceLabel} />
            <SummaryRow label="Guests" value={String(summary.guests)} />
            <SummaryRow label="Kids (0–5)" value={String(summary.childBelow5Count)} />
            <SummaryRow label="Kids (5–10)" value={String(summary.child5To10Count)} />
            <SummaryRow label="Menu" value={quote.isCustomMenu ? "Custom Menu" : (quote.menuName ?? "—")} />
            <SummaryRow label="Venue" value={summary.venueLine} />
          </dl>

          <div className="flex flex-col gap-4 text-sm" data-testid="review-pricing">
            {quote.isCustomMenu ? (
              <p className="rounded-lg bg-muted p-3 text-muted-foreground">
                Since this is a personalised menu, our team will confirm the price per plate after reviewing your selection.
              </p>
            ) : (
              <PriceBlock title={quote.menuName ?? "Menu"} amount={quote.menuAmount} detail={`${formatInr(quote.pricePerPlate ?? 0)} × ${quote.guests} guests${mealsSuffix}`} />
            )}
            {quote.childrenCharge > 0 && <PriceBlock title="Kids charges" amount={quote.childrenCharge} />}
            {quote.extras.length > 0 && (
              <PriceBlock title="Extra Items" amount={extrasTotal} accent>
                {quote.extras.map((e) => (
                  <li key={e.id}>
                    {e.name}: {formatInr(e.price)} × {quote.guests}
                    {mealsSuffix}
                  </li>
                ))}
              </PriceBlock>
            )}
            {quote.addOns.length > 0 && (
              <PriceBlock title="Add-ons" amount={addOnsTotal}>
                {quote.addOns.map((a) => (
                  <li key={a.id}>
                    {a.name}: {a.included ? "Included in package" : a.priceType === "PER_PLATE" ? `${formatInr(a.price)} × ${quote.guests}${mealsSuffix}` : `${formatInr(a.price)}${mealsSuffix}`}
                  </li>
                ))}
              </PriceBlock>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t-2 border-border pt-4">
            <span className="text-lg font-semibold">{quote.isCustomMenu ? "Total so far (excl. menu price)" : "Grand Total"}</span>
            <span data-testid="review-total" className="text-3xl font-bold text-primary">
              {formatInr(quote.total)}
            </span>
          </div>
        </FormCard>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <StepFooter onBack={() => router.push(`/${tenantSlug}/plan/${draftId}?step=venue`)}>
        <Button type="button" disabled={pending} onClick={handleSubmit}>
          {pending ? "Working…" : "Submit Request"}
          <Send />
        </Button>
      </StepFooter>
    </div>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}

function PriceBlock({ title, amount, detail, accent, children }: { title: string; amount: number; detail?: string; accent?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border pb-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{title}</span>
        <span className={accent ? "text-base font-semibold text-primary" : "text-base font-semibold"}>{formatInr(amount)}</span>
      </div>
      {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
      {children && <ul className="flex flex-col gap-0.5 pl-3 text-xs text-muted-foreground [&>li]:list-disc">{children}</ul>}
    </div>
  );
}
