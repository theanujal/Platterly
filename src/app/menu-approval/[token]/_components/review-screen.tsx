"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronDown, ChevronRight, ConciergeBell, Coffee, Flame, MapPin, MessageSquareText, Moon, Sparkles, Sun, Sunrise, UtensilsCrossed, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/public/form-section";
import type { ApprovalAddOnView, ApprovalMealView, ApprovalView } from "@/modules/menu-approvals/approval-view";
import { formatApprovalDay } from "@/modules/menu-approvals/approval-view";
import { requestMenuChangesAction } from "../actions";
import { PriceSummary } from "./price-summary";
import { cn } from "cn";

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MEAL_ICON = { BREAKFAST: Sunrise, LUNCH: Sun, HITEA: Coffee, DINNER: Moon, OTHER: UtensilsCrossed } as const;

function IconTile({ icon: Icon, small }: { icon: typeof Flame; small?: boolean }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", small ? "size-10" : "size-12")}>
      <Icon className={small ? "size-5" : "size-6"} />
    </span>
  );
}

const PREFIXES = ["Event details: ", "Menu: "];

function CardTitle({ icon: Icon, title, subtitle, action }: { icon: typeof CalendarDays; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The customer's "Review & Approve Your Menu" screen (REVIEW stage of the approval link): the event, the dishes by meal and the
 * add-ons on the left; the Price Summary with the Approve / Request Changes actions on the right (AJ, 2026-10-16). The Event
 * Overview "Edit" and the menu "Change" links open the same Request Changes box the button does, with a short prefix so the team
 * knows what the customer means: customers never edit the menu or the event themselves.
 */
export function ReviewScreen({ token, view, onApprove }: { token: string; view: ApprovalView; onApprove: () => void }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"changes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // The dishes popup: every meal ("all") or one meal (its key).
  const [dishesFor, setDishesFor] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(view.meals.map((meal) => meal.key)));
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

  const categoryCount = view.meals.reduce((sum, meal) => sum + meal.groups.length, 0);
  const itemCount = view.meals.reduce((sum, meal) => sum + mealItemCount(meal), 0);
  const hasGroups = categoryCount > 0;
  const allOpen = collapsed.size === 0;
  const manyDates = new Set(view.meals.map((meal) => meal.date)).size > 1;
  const mealTitle = (meal: ApprovalMealView) => (manyDates ? `${meal.label} · ${formatApprovalDay(meal.date)}` : meal.label);
  const dialogMeals = dishesFor === null || dishesFor === "all" ? view.meals : view.meals.filter((meal) => meal.key === dishesFor);
  const guestParts = [
    view.adults !== null ? `${view.adults} adult${view.adults === 1 ? "" : "s"}` : null,
    view.childBelow5 > 0 ? `${view.childBelow5} under 5` : null,
    view.child5To10 > 0 ? `${view.child5To10} aged 5–10` : null,
  ].filter(Boolean);

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
        <div className="flex min-w-0 flex-col gap-4">
          <FormCard className="gap-4 md:p-5">
            <CardTitle
              icon={CalendarDays}
              title="Event Overview"
              action={
                <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => openChanges("Event details: ")}>
                  Edit
                </Button>
              }
            />
            {/* Row 1: the event. Row 2: the menu and the guests. */}
            <dl className="grid grid-cols-1 text-sm md:auto-cols-fr md:grid-flow-col">
              {view.eventType && <Detail icon={<Sparkles className="size-5" />} label="Event Type" value={view.eventType} />}
              <Detail icon={<CalendarDays className="size-5" />} label="Date" value={view.dateText} />
              {view.location && <Detail icon={<MapPin className="size-5" />} label="Venue" value={view.location} />}
            </dl>
            <dl className="grid grid-cols-1 border-t border-border pt-4 text-sm md:auto-cols-fr md:grid-flow-col">
              <Detail
                icon={<ConciergeBell className="size-5" />}
                label={view.menus.length > 1 ? "Selected Menus" : "Selected Menu"}
                value={view.menus.length > 1 ? undefined : view.isCustomMenu ? "Custom Menu" : (view.menu?.name ?? "Your menu")}
                sub={view.menus.length > 1 ? undefined : view.menu?.pricePerPlate != null && !view.isCustomMenu ? `${inr(view.menu.pricePerPlate)} / plate` : view.isCustomMenu ? "Priced by our team" : undefined}
                action={
                  <>
                    {view.menus.length > 1 && (
                      <ul className="mb-1 flex flex-col gap-0.5" data-testid="selected-menus">
                        {view.menus.map((menu) => (
                          <li key={menu.name} className="font-semibold">
                            {menu.name}
                            {menu.pricePerPlate != null && <span className="font-normal text-muted-foreground"> ({inr(menu.pricePerPlate)} / plate)</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    <Button type="button" variant="link" className="h-auto p-0 text-xs font-medium" onClick={() => openChanges("Menu: ")}>
                      Change
                    </Button>
                  </>
                }
              />
              {view.guests !== null && <Detail icon={<Users className="size-5" />} label="Guests" value={`${view.guests} Guests`} sub={guestParts.join(" · ")} />}
            </dl>
          </FormCard>

          <FormCard className="gap-4 md:p-5">
            <CardTitle
              icon={UtensilsCrossed}
              title="Selected Dishes"
              subtitle={hasGroups ? `${view.meals.length} meal period${view.meals.length === 1 ? "" : "s"} · ${categoryCount} categor${categoryCount === 1 ? "y" : "ies"} · ${itemCount} item${itemCount === 1 ? "" : "s"}` : "Dishes included in your menu."}
              action={
                hasGroups && (
                  <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => setCollapsed(allOpen ? new Set(view.meals.map((meal) => meal.key)) : new Set())}>
                    {allOpen ? "Collapse all" : "Expand all"}
                  </Button>
                )
              }
            />
            {!hasGroups && view.looseItems.length === 0 && <p className="text-sm text-muted-foreground">No dishes listed.</p>}
            <div className="flex flex-col gap-3" data-testid="selected-dishes">
              {view.meals.map((meal) => {
                const open = !collapsed.has(meal.key);
                const items = mealItemCount(meal);
                const Icon = MEAL_ICON[meal.mealType];
                return (
                  <section key={meal.key} className="rounded-xl border border-border">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (open) next.add(meal.key); else next.delete(meal.key); return next; })}
                      className="flex w-full items-center gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <IconTile icon={Icon} small />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{mealTitle(meal)}</span>
                        <span className="block text-sm text-muted-foreground">
                          {meal.groups.length} categor{meal.groups.length === 1 ? "y" : "ies"} · {items} item{items === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm text-muted-foreground">{items} items</span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                    <div className="flex flex-col gap-3 px-3 pb-3">
                      {open && (
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {meal.groups.map((group) => (
                            <button
                              key={group.category}
                              type="button"
                              data-testid="dish-category"
                              onClick={() => setDishesFor(meal.key)}
                              className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-semibold">{group.category}</span>
                                <span className="block text-xs text-muted-foreground">
                                  {group.items.length} item{group.items.length === 1 ? "" : "s"}
                                </span>
                              </span>
                              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Closed: the categories as small chips with the button beside them, so a closed meal stays one short row. */}
                      <div className={cn("flex items-center gap-2", open ? "justify-end" : "justify-between")}>
                        {!open && (
                          <div className="flex min-w-0 flex-wrap gap-1.5">
                            {meal.groups.slice(0, 5).map((group) => (
                              <span key={group.category} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">
                                {group.category} ({group.items.length})
                              </span>
                            ))}
                            {meal.groups.length > 5 && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">+{meal.groups.length - 5} more</span>}
                          </div>
                        )}
                        <Button type="button" variant="outline" size="md" className="shrink-0 border-primary text-primary" onClick={() => setDishesFor(meal.key)}>
                          View all {items} items
                          <ArrowRight />
                        </Button>
                      </div>
                    </div>
                  </section>
                );
              })}
              {/* Versions sent before dishes were grouped, or dishes outside any meal. */}
              {view.looseItems.length > 0 && (
                <ul className="grid grid-cols-1 gap-1.5 text-sm">
                  {view.looseItems.map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" />
                      {item.isExtra ? `${item.name} (extra)` : item.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </FormCard>

          <AddOnsCard addOns={view.addOns} />
        </div>

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

      <Dialog open={dishesFor !== null} onOpenChange={(open) => !open && setDishesFor(null)}>
        <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">All selected dishes</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            {dialogMeals.map((meal) => (
              <div key={meal.key} className="flex flex-col gap-3">
                {view.meals.length > 1 && <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{mealTitle(meal)}</p>}
                {meal.groups.map((group) => (
                  <div key={group.category} className="flex flex-col gap-1.5">
                    <h3 className="text-sm font-semibold text-primary">
                      {group.category} <span className="font-normal text-muted-foreground">({group.items.length})</span>
                    </h3>
                    <ul className="flex flex-col gap-1 text-sm">
                      {group.items.map((item) => (
                        <li key={item.name} className="flex items-center gap-2">
                          <Check className="size-4 shrink-0 text-success" />
                          <span className="flex-1">{item.name}</span>
                          {item.isExtra && <Badge variant="warning">Extra</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setDishesFor(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function mealItemCount(meal: ApprovalMealView) {
  return meal.groups.reduce((sum, group) => sum + group.items.length, 0);
}

/** One cell of the Event Overview row; a hairline divides it from the one before (below it on a phone, beside it from md up). */
function Detail({ icon, label, value, sub, note, action }: { icon: React.ReactNode; label: string; value?: string; sub?: string; note?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 last:pb-0 md:border-t-0 md:border-l md:px-4 md:py-0 md:first:border-l-0 md:first:pl-0">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        {value && <dd className="font-semibold">{value}</dd>}
        {sub && <dd className="text-xs text-muted-foreground">{sub}</dd>}
        {note && <dd className="text-xs text-muted-foreground">{note}</dd>}
        {action && <dd>{action}</dd>}
      </div>
    </div>
  );
}

const TABS = [
  { key: "ALL", label: "All" },
  { key: "EXTRA_ITEM", label: "Extra Items" },
  { key: "LIVE_COUNTER", label: "Live Counters" },
  { key: "ADD_ON", label: "Add-ons" },
] as const;

/** Add-ons & Live Counters: every extra the customer picked, filtered by All / Extra Items / Live Counters / Add-ons. */
function AddOnsCard({ addOns }: { addOns: ApprovalAddOnView[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("ALL");
  const [open, setOpen] = useState(false);
  if (addOns.length === 0) return null;
  const tabs = TABS.filter((t) => t.key === "ALL" || addOns.some((a) => a.kind === t.key));
  const rows = tab === "ALL" ? addOns : addOns.filter((a) => a.kind === tab);
  return (
    <FormCard className="gap-4 md:p-5">
      <CardTitle
        icon={Flame}
        title="Add-ons & Live Counters"
        action={
          <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => setOpen(true)}>
            View all
          </Button>
        }
      />
      <p className="-mt-2 text-sm text-muted-foreground">Optional extras for your event.</p>
      {tabs.length > 2 && (
        <div role="tablist" aria-label="Filter extras" className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const count = t.key === "ALL" ? addOns.length : addOns.filter((a) => a.kind === t.key).length;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(t.key)}
                className={cn(
                  "h-9 rounded-lg border px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "border-primary bg-accent text-primary" : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                {t.label} ({count})
              </button>
            );
          })}
        </div>
      )}
      <AddOnList rows={rows} testId="approval-addons" />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">All add-ons & live counters</DialogTitle>
          </DialogHeader>
          <AddOnList rows={addOns} />
          <DialogFooter>
            <Button type="button" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FormCard>
  );
}

const KIND_ICON = { LIVE_COUNTER: Flame, EXTRA_ITEM: UtensilsCrossed, ADD_ON: Sparkles } as const;
const KIND_LABEL = { LIVE_COUNTER: "Live Counter", EXTRA_ITEM: "Extra Item", ADD_ON: "Add-on" } as const;

function AddOnList({ rows, testId }: { rows: ApprovalAddOnView[]; testId?: string }) {
  return (
    <ul className="flex flex-col gap-2" data-testid={testId}>
      {rows.map((addOn) => {
        // "₹70.00 / plate" -> the amount in the brand colour, the unit muted; "Included in package" stays whole.
        const [amount, ...unit] = addOn.priceLabel.startsWith("₹") ? addOn.priceLabel.split(" ") : [addOn.priceLabel];
        return (
          <li key={addOn.key} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
            <IconTile icon={KIND_ICON[addOn.kind]} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{addOn.name}</span>
              <span className="block text-muted-foreground">{KIND_LABEL[addOn.kind]}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className={cn("font-semibold", amount.startsWith("Included") ? "text-success" : "text-primary")}>{amount}</span>
              {unit.length > 0 && <span className="text-muted-foreground"> {unit.join(" ")}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
