"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Send, Sparkles, X } from "lucide-react";
import { StepFooter } from "@/components/public/step-footer";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/public/form-section";
import { SummaryRow, SummarySeparator } from "@/components/public/summary-row";
import { EditDetailsSheet, type EditDetails } from "./edit-details-sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInr } from "@/lib/format-currency";
import type { DraftQuote } from "@/modules/menu-approvals/storefront-draft";
import type { MealType } from "@/generated/prisma/enums";
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
  /** Each meal's own menu and dishes (AJ, 2026-10-12), in serving order. */
  meals: ReviewMeal[];
  venueLine: string;
  /** When the summary was produced, already formatted (server-side, so it never mismatches on hydration). */
  placedAt: string;
}

export interface ReviewMeal {
  mealType: MealType;
  label: string;
  menuName: string | null;
  /** The dishes inside the menu, by category. Extras are listed separately. */
  selectedSections: { categoryName: string; items: string[] }[];
  /** Extra dishes with the category each sits in. */
  extraCategories: Record<string, string>;
  itemIds: string[];
  addOnIds: string[];
}

interface ReviewStepProps {
  tenantSlug: string;
  draftId: string;
  summary: ReviewSummary;
  quote: DraftQuote;
  /** What the Edit details panel needs, so the details change without leaving the review. */
  editDetails: EditDetails;
}

/**
 * Step 3: what the customer chose, laid out like a receipt (AJ, 2026-10-01): the selection on the left, the order
 * summary with the running total on the right. Extras and add-ons can be removed here; the dishes inside the menu
 * can't (the category minimums are set on the Build Your Menu step).
 */
export function ReviewStep({ tenantSlug, draftId, summary, quote, editDetails }: ReviewStepProps) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const backToMenu = () => router.push(`/${tenantSlug}/plan/${draftId}?step=menu`);

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

  async function removeExtra(mealType: MealType, id: string) {
    setError(null);
    setPending(true);
    const meal = summary.meals.find((m) => m.mealType === mealType)!;
    const result = await saveItemsAction(tenantSlug, draftId, mealType, meal.itemIds.filter((x) => x !== id));
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  async function removeAddOn(mealType: MealType, id: string) {
    setError(null);
    setPending(true);
    const meal = summary.meals.find((m) => m.mealType === mealType)!;
    const result = await saveAddOnsAction(tenantSlug, draftId, mealType, meal.addOnIds.filter((x) => x !== id));
    setPending(false);
    if (!result.ok) return setError(result.error);
    router.refresh();
  }

  // Several meals (AJ, 2026-10-12): each has its own menu, dishes, extras and add-ons, so they are listed meal by meal.
  const several = quote.perMeal.length > 1;
  const labelOf = (mealType: MealType) => summary.meals.find((m) => m.mealType === mealType)?.label ?? mealType;
  const nothingExtra = quote.extras.length === 0 && quote.addOns.length === 0;

  return (
    <div className="flex flex-col gap-6 pb-28 lg:pb-0">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Review Your Request</h2>
        <p className="text-sm text-muted-foreground">Check everything below, then submit it for approval. This is a request, not a confirmed order: our team reviews your menu and follows up with you.</p>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex flex-col gap-6">
          <FormCard className="gap-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold">Selected Menu Items</h3>
              {!several && summary.meals[0] && <EditLink href={`/${tenantSlug}/plan/${draftId}?step=menu&meal=${summary.meals[0].mealType}`} label="Edit menu and dishes" />}
            </div>
            <div className="flex flex-col gap-5" data-testid="review-items">
              {summary.meals.map((meal) => (
                <div key={meal.mealType} className="flex flex-col gap-4" data-testid="review-meal">
                  {several && (
                    <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                      <h4 className="min-w-0 text-base font-semibold">
                        {meal.label}
                        {meal.menuName ? <span className="font-normal text-muted-foreground"> · {meal.menuName}</span> : null}
                      </h4>
                      <EditLink href={`/${tenantSlug}/plan/${draftId}?step=menu&meal=${meal.mealType}`} label={`Edit ${meal.label}`} />
                    </div>
                  )}
                  {meal.selectedSections.length === 0 && <p className="text-sm text-muted-foreground">No dishes selected.</p>}
                  {meal.selectedSections.map((section) => (
                    <div key={section.categoryName} className="flex flex-col gap-1">
                      <h4 className="text-base font-semibold text-primary">{section.categoryName}</h4>
                      <p className="text-sm">{section.items.join(", ")}</p>
                    </div>
                  ))}
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
                {quote.perMeal.flatMap((mealQuote) =>
                  mealQuote.extras.map((extra) => (
                    <div key={`${mealQuote.mealType}-${extra.id}`} data-testid="review-extra" className="flex items-center gap-3 rounded-xl bg-info/10 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{extra.name}</span>
                        {several && <span className="text-sm text-muted-foreground">{labelOf(mealQuote.mealType)}</span>}
                        {summary.meals.find((m) => m.mealType === mealQuote.mealType)?.extraCategories[extra.id] && (
                          <span className="text-sm text-muted-foreground">{summary.meals.find((m) => m.mealType === mealQuote.mealType)!.extraCategories[extra.id]}</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatInr(extra.price)} × {quote.guests} guests
                        </span>
                      </div>
                      <span className="font-semibold text-primary">{formatInr(extra.amount)}</span>
                      <RemoveButton label={several ? `Remove ${extra.name} from ${labelOf(mealQuote.mealType)}` : `Remove ${extra.name}`} disabled={pending} onClick={() => removeExtra(mealQuote.mealType, extra.id)} />
                    </div>
                  )),
                )}
              </div>
            )}

            {quote.addOns.length > 0 && (
              <div className="flex flex-col gap-3 border-t border-border pt-4">
                <h4 className="text-base font-semibold">Live Counters &amp; Services</h4>
                {quote.perMeal.flatMap((mealQuote) =>
                  [...mealQuote.addOns.filter((a) => a.type === "LIVE_COUNTER"), ...mealQuote.addOns.filter((a) => a.type !== "LIVE_COUNTER")].map((addOn) => (
                    <div key={`${mealQuote.mealType}-${addOn.id}`} data-testid="review-addon" className="flex items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="font-semibold">{addOn.name}</span>
                        {several && <span className="text-sm text-muted-foreground">{labelOf(mealQuote.mealType)}</span>}
                        {!addOn.included && addOn.priceType === "PER_PLATE" && (
                          <span className="text-xs text-muted-foreground">
                            {formatInr(addOn.price)} × {quote.guests} guests
                          </span>
                        )}
                      </div>
                      <span className="font-semibold text-primary">{addOn.included ? "Included" : formatInr(addOn.amount)}</span>
                      <RemoveButton label={several ? `Remove ${addOn.name} from ${labelOf(mealQuote.mealType)}` : `Remove ${addOn.name}`} disabled={pending} onClick={() => removeAddOn(mealQuote.mealType, addOn.id)} />
                    </div>
                  )),
                )}
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

        <FormCard className="gap-5 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)]">
          {/* The summary scrolls inside the card on a short window, so Submit and Back below stay in reach. */}
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="text-xl font-semibold">Order Summary</h3>
                <p className="text-sm text-muted-foreground">{summary.placedAt}</p>
              </div>
              <button type="button" onClick={() => setEditOpen(true)} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                <Pencil className="size-3.5" /> Edit details
              </button>
            </div>

            <dl className="flex flex-col gap-2 border-y border-dashed border-border py-4 text-sm">
              <SummaryRow label="Customer" value={summary.customerName} />
              <SummaryRow label="Phone" value={summary.phone} />
              <SummaryRow label="Event Type" value={summary.eventTypeName} />
              <SummaryRow label="Event Date" value={summary.eventDate} />
              <SummaryRow label="Meals Required" value={summary.mealType} />
              <SummaryRow label="Preference" value={summary.menuPreferenceLabel} />
              <SummaryRow label="Adults" value={String(summary.guests)} />
              <SummaryRow label="Kids (0–5)" value={String(summary.childBelow5Count)} />
              <SummaryRow label="Kids (5–10)" value={String(summary.child5To10Count)} />
              <SummarySeparator />
              <SummaryRow label="Total Guests" value={String(summary.guests + summary.childBelow5Count + summary.child5To10Count)} testId="review-total-guests" />
              <SummarySeparator />
              <SummaryRow label={several ? "Menus" : "Menu"} value={several ? (summary.meals.map((m) => `${m.label}: ${m.menuName ?? "—"}`).join(" · ")) : quote.isCustomMenu ? "Custom Menu" : (quote.menuName ?? "—")} />
              <SummaryRow label="Event Location" value={summary.venueLine} />
            </dl>

            <div className="flex flex-col gap-4 text-sm" data-testid="review-pricing">
              {quote.perMeal.map((mealQuote) =>
                mealQuote.isCustomMenu ? (
                  <p key={mealQuote.mealType} className="rounded-lg bg-muted p-3 text-muted-foreground">
                    {several ? `${labelOf(mealQuote.mealType)}: ` : ""}Since this is a personalised menu, our team will confirm the price per plate after reviewing your selection.
                  </p>
                ) : (
                  <PriceBlock
                    key={mealQuote.mealType}
                    title={several ? `${labelOf(mealQuote.mealType)} · ${mealQuote.menuName ?? "Menu"}` : (mealQuote.menuName ?? "Menu")}
                    amount={mealQuote.menuAmount}
                    detail={`${formatInr(mealQuote.pricePerPlate ?? 0)} × ${quote.guests} guests`}
                  />
                ),
              )}
              {quote.childrenCharge > 0 && <PriceBlock title="Kids charges" amount={quote.childrenCharge} />}
              {quote.extras.length > 0 && (
                <PriceBlock title="Extra Items" amount={quote.extras.reduce((sum, e) => sum + e.amount, 0)} accent>
                  {quote.perMeal.flatMap((m) =>
                    m.extras.map((e) => (
                      <li key={`${m.mealType}-${e.id}`}>
                        {several ? `${labelOf(m.mealType)} · ` : ""}
                        {e.name}: {formatInr(e.price)} × {quote.guests}
                      </li>
                    )),
                  )}
                </PriceBlock>
              )}
              {quote.addOns.length > 0 && (
                <PriceBlock title="Add-ons" amount={quote.addOns.reduce((sum, a) => sum + a.amount, 0)}>
                  {quote.perMeal.flatMap((m) =>
                    m.addOns.map((a) => (
                      <li key={`${m.mealType}-${a.id}`}>
                        {several ? `${labelOf(m.mealType)} · ` : ""}
                        {a.name}: {a.included ? "Included in package" : a.priceType === "PER_PLATE" ? `${formatInr(a.price)} × ${quote.guests}` : formatInr(a.price)}
                      </li>
                    )),
                  )}
                </PriceBlock>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t-2 border-border pt-4">
              <span className="text-lg font-semibold">{quote.isCustomMenu ? "Total so far (excl. menu price)" : "Grand Total"}</span>
              <span data-testid="review-total" className="text-3xl font-bold text-primary">
                {formatInr(quote.total)}
              </span>
            </div>
          </div>

          {/* A big screen has no bottom bar (AJ, 2026-10-14), like Build Your Menu: Submit and Back end the summary. */}
          <div className="hidden shrink-0 flex-col gap-2 lg:flex">
            <Button type="button" size="lg" className="w-full" disabled={pending} onClick={handleSubmit}>
              {pending ? "Working…" : "Submit for Menu Approval"}
              <Send />
            </Button>
            <Button type="button" size="lg" variant="outline" className="w-full" onClick={backToMenu}>
              <ArrowLeft /> Back to menu
            </Button>
          </div>
        </FormCard>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <StepFooter className="lg:hidden" onBack={backToMenu} backLabel="Back to menu">
        <Button type="button" size="lg" disabled={pending} onClick={handleSubmit}>
          {pending ? "Working…" : <span>Submit<span className="max-sm:sr-only"> for Menu Approval</span></span>}
          <Send />
        </Button>
      </StepFooter>

      <EditDetailsSheet
        tenantSlug={tenantSlug}
        draftId={draftId}
        details={editDetails}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          router.refresh(); // new dates, guests and prices; a changed event type or preference sends the customer back to rebuild the menu
        }}
      />
    </div>
  );
}

function EditLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} aria-label={label} className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline">
      <Pencil className="size-3.5" /> Edit
    </Link>
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
