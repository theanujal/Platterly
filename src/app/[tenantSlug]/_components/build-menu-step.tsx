"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { StepFooter } from "@/components/public/step-footer";
import { Button } from "@/components/ui/button";
import { formatInr } from "@/lib/format-currency";
import type { StorefrontMenu, StorefrontMenuSection } from "@/modules/menus/menu";
import type { DraftQuote, MenuChoice } from "@/modules/menu-approvals/storefront-draft";
import { requiredShortfalls, splitPicks } from "@/modules/menu-approvals/storefront-selection";
import { estimateQuoteAction, saveBuildMenuAction } from "../actions";
import { MenuSection } from "./menu-section";
import { DishesSection } from "./dishes-section";
import { AddOnsSection, type StorefrontAddOn } from "./addons-section";
import { cn } from "cn";

export interface BuildMenuEventSummary {
  date: string;
  eventType: string;
  guests: string;
  meals: string;
  preference: string;
  location: string;
}

interface BuildMenuStepProps {
  tenantSlug: string;
  draftId: string;
  menus: StorefrontMenu[];
  /** Every active dish, by category, for the Custom Menu. */
  customSections: StorefrontMenuSection[];
  addOns: StorefrontAddOn[];
  guests: number;
  event: BuildMenuEventSummary;
  initial: { choice: MenuChoice | null; itemIds: string[]; addOnIds: string[] };
}

const sameChoice = (a: MenuChoice | null, b: MenuChoice | null) => JSON.stringify(a) === JSON.stringify(b);

function scrollToRef(element: HTMLElement | null) {
  if (!element) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/**
 * Step 2, Build Your Menu (AJ, 2026-10-02): what used to be Choose Menu, Choose Items and Add-ons & Live Counters on
 * one page that opens up as the customer goes. All menus are shown until one is picked, then only that menu stays;
 * its dishes appear; once every required category is complete the optional add-ons appear. The Estimated Total and
 * the counts sit in a sidebar on a big screen and in the bottom bar on a phone. Saving, the limits, the extras and
 * the prices are the same code as before.
 */
export function BuildMenuStep({ tenantSlug, draftId, menus, customSections, addOns, guests, event, initial }: BuildMenuStepProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<MenuChoice | null>(initial.choice);
  const [listOpen, setListOpen] = useState(initial.choice === null);
  const [itemIds, setItemIds] = useState<string[]>(initial.itemIds);
  const [addOnIds, setAddOnIds] = useState<string[]>(initial.addOnIds);
  const [quote, setQuote] = useState<DraftQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const dishesRef = useRef<HTMLDivElement>(null);
  const addOnsRef = useRef<HTMLDivElement>(null);

  const pickedMenu = choice?.kind === "MENU" ? menus.find((menu) => menu.id === choice.menuId) : undefined;
  const isCustomMenu = choice?.kind === "CUSTOM";
  const sections = useMemo(() => (isCustomMenu ? customSections : (pickedMenu?.sections ?? [])), [isCustomMenu, customSections, pickedMenu]);
  const hasMenu = isCustomMenu || pickedMenu !== undefined;

  // The same rules the server re-checks on save: every limited category full, and at least one dish.
  const short = isCustomMenu ? [] : requiredShortfalls(sections, itemIds);
  const complete = hasMenu && itemIds.length > 0 && short.length === 0;
  const split = useMemo(() => splitPicks(sections, itemIds), [sections, itemIds]);
  const cappedSections = sections.filter((section) => section.maxSelection !== null);
  const categoriesDone = isCustomMenu ? 0 : cappedSections.length - short.length;

  function choose(next: MenuChoice) {
    if (!sameChoice(choice, next)) setItemIds([]); // a different menu has different dishes (the server clears them too)
    setChoice(next);
    setListOpen(false);
    setError(null);
    setAnnouncement("Menu chosen. Now select your dishes.");
    requestAnimationFrame(() => scrollToRef(dishesRef.current));
  }

  // The add-ons open up the moment the dishes are complete (not on first load of an already-complete draft).
  const wasComplete = useRef(complete);
  useEffect(() => {
    if (complete && !wasComplete.current && addOns.length > 0) {
      setAnnouncement("Your dishes are complete. Add-ons and live counters are optional below.");
      requestAnimationFrame(() => scrollToRef(addOnsRef.current));
    }
    wasComplete.current = complete;
  }, [complete, addOns.length]);

  // The running Estimated Total is the server's own calculation, run on the picks as they stand (not saved).
  useEffect(() => {
    if (!hasMenu || !choice) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await estimateQuoteAction(tenantSlug, draftId, { choice, itemIds, addOnIds });
      if (!cancelled && result.ok) setQuote(result.quote);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tenantSlug, draftId, choice, itemIds, addOnIds, hasMenu]);

  async function handleContinue() {
    if (!choice || !complete) return;
    setError(null);
    setPending(true);
    const result = await saveBuildMenuAction(tenantSlug, draftId, { choice, itemIds, addOnIds });
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.push(`/${tenantSlug}/plan/${draftId}?step=review`);
  }

  const total = hasMenu && quote ? formatInr(quote.total) : "—";
  const totalLabel = isCustomMenu ? "Estimated total (excl. menu price)" : "Estimated Total";
  const dishesLine = `${itemIds.length} dish${itemIds.length === 1 ? "" : "es"} selected${split.extraIds.length > 0 ? ` (${split.extraIds.length} extra)` : ""}`;
  const addOnsLine = `${addOnIds.length} add-on${addOnIds.length === 1 ? "" : "s"} selected`;
  const whyDisabled = !hasMenu ? "Choose a menu to continue." : itemIds.length === 0 || short.length > 0 ? "Select your dishes to continue." : null;
  const backToDetails = () => router.push(`/${tenantSlug}/plan/${draftId}?step=details`);

  return (
    <div className="flex flex-col gap-6 pb-28 lg:pb-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-semibold">Build Your Menu</h2>
        <p className="text-sm text-muted-foreground">Choose a menu, select dishes from each category and add any extras you need.</p>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <MenuSection menus={menus} choice={hasMenu ? choice : null} listOpen={listOpen || !hasMenu} onChoose={choose} onChange={() => setListOpen(true)} onCancelChange={() => setListOpen(false)} />

          {hasMenu && (
            <div ref={dishesRef} className="scroll-mt-4">
              <DishesSection
                key={isCustomMenu ? "custom" : (pickedMenu?.id ?? "none")}
                menuName={pickedMenu?.name ?? null}
                sections={sections}
                guests={guests}
                isCustomMenu={isCustomMenu}
                itemIds={itemIds}
                onItemIdsChange={(update) => setItemIds(update)}
              />
            </div>
          )}

          {complete && addOns.length > 0 && (
            <div ref={addOnsRef} className="scroll-mt-4">
              <AddOnsSection addOns={addOns} guests={guests} addOnIds={addOnIds} onAddOnIdsChange={(update) => setAddOnIds(update)} />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        {/* A big screen: the running summary beside the page. A phone gets the same facts in the bottom bar. */}
        <aside aria-label="Your selection" className="hidden flex-col gap-5 rounded-xl bg-card p-5 ring-1 ring-foreground/10 lg:sticky lg:top-6 lg:flex">
          <h3 className="text-lg font-semibold">Your Selection</h3>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Event Summary</h4>
              <Link href={`/${tenantSlug}/plan/${draftId}?step=details`} className="text-sm font-medium text-primary hover:underline">
                Edit
              </Link>
            </div>
            <dl className="flex flex-col gap-1.5 text-sm">
              <SummaryRow label="Date" value={event.date} />
              <SummaryRow label="Event Type" value={event.eventType} />
              <SummaryRow label="Guests" value={event.guests} />
              <SummaryRow label="Meals" value={event.meals} />
              <SummaryRow label="Preference" value={event.preference} />
              <SummaryRow label="Location" value={event.location} />
            </dl>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-border pt-4 text-sm">
            <h4 className="text-sm font-semibold">Selected Menu</h4>
            {hasMenu ? (
              <p>
                {isCustomMenu ? "Custom Menu" : pickedMenu?.name}
                {!isCustomMenu && pickedMenu && <span className="text-muted-foreground"> · {formatInr(pickedMenu.pricePerPlate)} / plate</span>}
              </p>
            ) : (
              <p className="text-muted-foreground">Not chosen yet</p>
            )}
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm" aria-live="polite">
            <h4 className="text-sm font-semibold">Dishes</h4>
            <p data-testid="selection-summary">{dishesLine}</p>
            {!isCustomMenu && cappedSections.length > 0 && (
              <p className="text-muted-foreground" data-testid="categories-summary">
                {categoriesDone} of {cappedSections.length} categories complete
              </p>
            )}
            {split.extraIds.length > 0 && quote && quote.extras.length > 0 && (
              <p className="font-medium" data-testid="extras-summary">
                Extras: {formatInr(quote.extras.reduce((sum, extra) => sum + extra.amount, 0))}
              </p>
            )}
            <h4 className="mt-3 text-sm font-semibold">Add-ons &amp; Live Counters</h4>
            <p data-testid="addon-summary">{addOnsLine}</p>
          </div>

          <div className="flex flex-col gap-1 rounded-xl bg-accent/60 p-4">
            <span className="text-sm font-semibold">{totalLabel}</span>
            <span className="text-3xl font-bold text-primary" data-testid="estimated-total" aria-live="polite">
              {total}
            </span>
            <span className="text-xs text-muted-foreground">Final pricing is confirmed by the kitchen after reviewing your menu and event requirements.</span>
          </div>

          <div className="flex flex-col gap-2">
            <Button type="button" size="lg" disabled={!complete || pending} onClick={handleContinue} aria-describedby={whyDisabled ? "continue-why" : undefined}>
              {pending ? "Saving…" : "Continue to Review"}
              <ArrowRight />
            </Button>
            {whyDisabled && (
              <p id="continue-why" className="text-center text-xs text-muted-foreground">
                {whyDisabled}
              </p>
            )}
            <Button type="button" variant="outline" onClick={backToDetails}>
              <ArrowLeft /> Back
            </Button>
          </div>
        </aside>
      </div>

      <div className="lg:hidden">
        <StepFooter
          onBack={backToDetails}
          summary={
            <span className="flex flex-col items-center leading-tight">
              <span>{hasMenu && !isCustomMenu ? `${categoriesDone} of ${cappedSections.length} categories` : dishesLine}</span>
              <span className={cn("font-semibold text-foreground")}>
                {totalLabel}: {total}
              </span>
            </span>
          }
        >
          <Button type="button" disabled={!complete || pending} onClick={handleContinue}>
            {pending ? "Saving…" : "Continue"}
            <ArrowRight />
          </Button>
        </StepFooter>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
