"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Sparkles } from "lucide-react";
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

/** A saved draft that already has a complete menu opens with the dishes folded. */
function initialDishesComplete(menus: StorefrontMenu[], customSections: StorefrontMenuSection[], initial: { choice: MenuChoice | null; itemIds: string[] }) {
  if (!initial.choice || initial.itemIds.length === 0) return false;
  if (initial.choice.kind === "CUSTOM") return true;
  const menuId = initial.choice.menuId;
  const menu = menus.find((m) => m.id === menuId);
  return menu !== undefined && requiredShortfalls(menu.sections, initial.itemIds).length === 0;
}

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
 *
 * One bottom bar on every screen size and every step (Back left, Continue right, AJ 2026-10-10), like the other steps.
 * Once the dishes are complete they fold into a one-line accordion (tap to reopen and change them) and the Add-ons card
 * is brought into view.
 */
export function BuildMenuStep({ tenantSlug, draftId, menus, customSections, addOns, guests, event, initial }: BuildMenuStepProps) {
  const router = useRouter();
  const [choice, setChoice] = useState<MenuChoice | null>(initial.choice);
  const [listOpen, setListOpen] = useState(initial.choice === null);
  // The dishes card folds away once complete; the customer can reopen it. Reopening never survives dropping below complete.
  const [dishesOpen, setDishesOpen] = useState(() => !initialDishesComplete(menus, customSections, initial));
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
  const dishesFolded = complete && !dishesOpen;

  function choose(next: MenuChoice) {
    if (!sameChoice(choice, next)) setItemIds([]); // a different menu has different dishes (the server clears them too)
    setChoice(next);
    setListOpen(false);
    setError(null);
    setAnnouncement("Menu chosen. Now select your dishes.");
    requestAnimationFrame(() => scrollToRef(dishesRef.current));
  }

  // The moment the dishes become complete they fold away and the add-ons are brought into view; dropping below complete reopens them.
  function changeItems(update: (previous: string[]) => string[]) {
    const next = update(itemIds);
    setItemIds(next);
    const nowComplete = hasMenu && next.length > 0 && (isCustomMenu || requiredShortfalls(sections, next).length === 0);
    if (nowComplete && !complete) {
      setDishesOpen(false);
      if (addOns.length > 0) {
        setAnnouncement("Your dishes are complete and folded away. Add-ons and live counters are optional below.");
        // After the dishes fold, so the add-ons land at the top of the screen.
        setTimeout(() => requestAnimationFrame(() => scrollToRef(addOnsRef.current)), 50);
      }
    }
    if (!nowComplete && complete) setDishesOpen(true);
  }

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
    <div className="flex flex-col gap-6 pb-28">
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
            <div ref={dishesRef} className="flex scroll-mt-4 flex-col gap-3">
              <div>
                <DishesSection
                  key={isCustomMenu ? "custom" : (pickedMenu?.id ?? "none")}
                  menuName={pickedMenu?.name ?? null}
                  sections={sections}
                  guests={guests}
                  isCustomMenu={isCustomMenu}
                  itemIds={itemIds}
                  onItemIdsChange={changeItems}
                  fold={complete ? { folded: dishesFolded, onToggle: () => setDishesOpen((open) => !open), summary: `${dishesLine}${!isCustomMenu && cappedSections.length > 0 ? ` · ${categoriesDone} of ${cappedSections.length} categories` : ""}` } : undefined}
                />
              </div>
            </div>
          )}

          {complete && addOns.length > 0 && (
            <div ref={addOnsRef} className="flex scroll-mt-4 flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {dishesFolded && (
                <p className="flex items-center justify-center gap-2 text-sm font-medium text-primary">
                  <Sparkles className="size-4" /> Dishes done. Want to make it special? Add live counters or extras, or skip to continue.
                </p>
              )}
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
        </aside>
      </div>

      <StepFooter
        onBack={backToDetails}
        summary={
          <span className="flex flex-col items-center leading-tight lg:flex-row lg:gap-4">
            <span>{hasMenu && !isCustomMenu ? `${categoriesDone} of ${cappedSections.length} categories` : dishesLine}</span>
            <span className="font-semibold text-foreground">
              {totalLabel}: {total}
            </span>
            {whyDisabled && (
              <span id="continue-why" className="sr-only">
                {whyDisabled}
              </span>
            )}
          </span>
        }
      >
        <Button type="button" size="lg" disabled={!complete || pending} onClick={handleContinue} aria-describedby={whyDisabled ? "continue-why" : undefined}>
          {pending ? "Saving…" : <span>Continue<span className="max-sm:sr-only"> to Review</span></span>}
          <ArrowRight />
        </Button>
      </StepFooter>
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
