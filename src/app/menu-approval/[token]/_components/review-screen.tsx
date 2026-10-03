"use client";

import { useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, ChevronRight, CupSoda, Croissant, Flame, IceCreamBowl, Info, MapPin, MessageSquareText, Salad, Soup, Sparkles, UtensilsCrossed, Users, Wheat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormCard } from "@/components/public/form-section";
import type { ApprovalAddOnView, ApprovalView } from "@/modules/menu-approvals/approval-view";
import { formatApprovalDay } from "@/modules/menu-approvals/approval-view";
import { requestMenuChangesAction } from "../actions";
import { PriceSummary } from "./price-summary";
import { cn } from "cn";

function inr(amount: number) {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A category's icon, picked from its name; anything unrecognised gets the plain dish icon. */
function categoryIcon(category: string) {
  const name = category.toLowerCase();
  if (/starter|appetizer|snack/.test(name)) return Soup;
  if (/rice|biryani|pulao/.test(name)) return Wheat;
  if (/bread|roti|naan/.test(name)) return Croissant;
  if (/dessert|sweet/.test(name)) return IceCreamBowl;
  if (/beverage|drink|juice|mocktail/.test(name)) return CupSoda;
  if (/salad|accompaniment|side/.test(name)) return Salad;
  return UtensilsCrossed;
}

function IconTile({ icon: Icon }: { icon: typeof Flame }) {
  return (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
      <Icon className="size-6" />
    </span>
  );
}

const PREFIXES = ["Event details: ", "Menu: "];

function CardTitle({ icon: Icon, title, action }: { icon: typeof CalendarDays; title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

/**
 * The customer's "Review & Approve Your Menu" screen (REVIEW stage of the approval link). The Event Details "Edit" and the
 * Proposed Menu "Change" links open the same Request Changes box the buttons do, with a short prefix so the team knows
 * what the customer means: customers never edit the menu or the event themselves.
 */
export function ReviewScreen({ token, view, onApprove }: { token: string; view: ApprovalView; onApprove: () => void }) {
  const [mode, setMode] = useState<"idle" | "changes">("idle");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState<"changes" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [dishesOpen, setDishesOpen] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);

  function openChanges(prefix?: string) {
    setMode("changes");
    // A prefix only replaces an empty box or another untouched prefix; anything the customer typed stays.
    if (prefix && (note.trim() === "" || PREFIXES.includes(note))) setNote(prefix);
    requestAnimationFrame(() => {
      actionsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      noteRef.current?.focus();
    });
  }

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

  const menuCount = view.meals.reduce((sum, meal) => sum + meal.groups.reduce((s, g) => s + g.items.length, 0), 0);
  const hasGroups = view.meals.some((meal) => meal.groups.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* Column 1: the event and the proposed menu */}
        <div className="flex flex-col gap-4">
          <FormCard className="gap-4 md:p-5">
            <CardTitle
              icon={CalendarDays}
              title="Event Details"
              action={
                <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => openChanges("Event details: ")}>
                  Edit
                </Button>
              }
            />
            <dl className="flex flex-col gap-3 text-sm">
              {view.eventType && <Detail icon={<Sparkles className="size-4" />} label="Event Type" value={view.eventType} />}
              <Detail icon={<CalendarDays className="size-4" />} label="Date" value={view.dateText} />
              {view.guests !== null && <Detail icon={<Users className="size-4" />} label="Guests" value={`${view.guests} Guests`} />}
              {view.location && <Detail icon={<MapPin className="size-4" />} label="Location" value={view.location} />}
            </dl>
          </FormCard>

          <FormCard className="gap-4 md:p-5">
            <CardTitle
              icon={UtensilsCrossed}
              title="Proposed Menu"
              action={
                <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => openChanges("Menu: ")}>
                  Change
                </Button>
              }
            />
            <div className="flex gap-3">
              {view.menu?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={view.menu.image} alt="" className="size-20 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <UtensilsCrossed className="size-7 text-muted-foreground" />
                </span>
              )}
              <div className="flex min-w-0 flex-col gap-1">
                <p className="font-semibold">{view.isCustomMenu ? "Custom Menu" : (view.menu?.name ?? "Your menu")}</p>
                {view.menu?.pricePerPlate != null && !view.isCustomMenu && (
                  <p className="text-sm">
                    <span className="font-semibold">{inr(view.menu.pricePerPlate)}</span> <span className="text-muted-foreground">/ plate</span>
                  </p>
                )}
                {view.menu?.description && <p className="line-clamp-3 text-sm text-muted-foreground">{view.menu.description}</p>}
                {view.isCustomMenu && <p className="text-sm text-muted-foreground">Hand-picked dishes. Our team confirms the price per plate.</p>}
                {view.menu && view.menu.extraMenus.length > 0 && <p className="text-xs text-muted-foreground">Also: {view.menu.extraMenus.join(", ")}</p>}
              </div>
            </div>
          </FormCard>
        </div>

        {/* Column 2: the dishes */}
        <FormCard className="gap-4 md:p-5" >
          <CardTitle
            icon={UtensilsCrossed}
            title="Selected Dishes"
            action={
              hasGroups && (
                <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => setDishesOpen(true)}>
                  View all
                </Button>
              )
            }
          />
          <p className="-mt-2 text-sm text-muted-foreground">Dishes included in your menu.</p>
          {!hasGroups && view.looseItems.length === 0 && <p className="text-sm text-muted-foreground">No dishes listed.</p>}
          <div className="flex flex-col gap-4" data-testid="selected-dishes">
            {view.meals.map((meal) => (
              <div key={meal.key} className="flex flex-col gap-2">
                {view.meals.length > 1 && (
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {meal.label} · {formatApprovalDay(meal.date)}
                  </p>
                )}
                {meal.groups.map((group) => (
                  <button
                    key={group.category}
                    type="button"
                    onClick={() => setDishesOpen(true)}
                    className="flex w-full items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <IconTile icon={categoryIcon(group.category)} />
                    <div className="w-28 shrink-0 sm:w-36">
                      <p className="text-sm font-semibold">{group.category}</p>
                      <p className="text-sm text-muted-foreground">
                        {group.items.length} item{group.items.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="min-w-0 flex-1 text-sm text-muted-foreground">{group.items.map((i) => i.name).join(", ")}</p>
                    <ChevronRight className="size-4 shrink-0 text-primary" aria-hidden />
                  </button>
                ))}
              </div>
            ))}
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
          {menuCount > 0 && <p className="sr-only">{menuCount} dishes in total</p>}
        </FormCard>

        {/* Column 3: add-ons and the price */}
        <div className="flex flex-col gap-4">
          <AddOnsCard addOns={view.addOns} />
          <PriceSummary rows={view.priceRows} total={view.total} isCustomMenu={view.isCustomMenu} />
        </div>
      </div>

      <div ref={actionsRef} className="flex flex-col gap-4 rounded-xl bg-accent/60 p-4 ring-1 ring-primary/10 md:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-6">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="size-5" />
          </span>
          <div className="text-sm">
            <p className="font-semibold">What happens next?</p>
            <p className="text-muted-foreground">After you approve, you&apos;ll add your venue and delivery details. Your approval is confirmed when you send them.</p>
          </div>
        </div>

        {(mode === "changes" || error) && (
          <div className="flex flex-col gap-4 lg:col-span-2 lg:row-start-2">
            {mode === "changes" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="approval-note">What would you like to change?</Label>
                <Textarea
                  id="approval-note"
                  ref={noteRef}
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
          </div>
        )}
        {/* On a phone only the buttons stay on screen, so the menu above is never hidden behind a tall card. */}
        <div className="flex flex-col-reverse gap-2 max-lg:sticky max-lg:bottom-0 max-lg:-mx-4 max-lg:-mb-4 max-lg:rounded-b-xl max-lg:border-t max-lg:border-border max-lg:bg-card/95 max-lg:p-3 max-lg:backdrop-blur sm:flex-row sm:justify-end md:max-lg:-mx-5 md:max-lg:-mb-5 lg:col-start-2 lg:row-start-1">
          {mode === "idle" ? (
            <>
              <Button type="button" variant="outline" disabled={pending !== null} onClick={() => openChanges()}>
                Request Changes
              </Button>
              <Button type="button" disabled={pending !== null} onClick={onApprove}>
                Approve Menu
                <ArrowRight />
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={pending !== null} onClick={() => { setMode("idle"); setError(null); setNote(""); }}>
                Cancel
              </Button>
              <Button type="button" disabled={pending !== null || note.trim() === ""} onClick={handleRequestChanges}>
                {pending === "changes" ? "Sending…" : "Submit Request"}
              </Button>
            </>
          )}
        </div>
      </div>

      <Dialog open={dishesOpen} onOpenChange={setDishesOpen}>
        <DialogContent className="max-h-[85vh] gap-4 overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">All selected dishes</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            {view.meals.map((meal) => (
              <div key={meal.key} className="flex flex-col gap-3">
                {view.meals.length > 1 && (
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {meal.label} · {formatApprovalDay(meal.date)}
                  </p>
                )}
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
            <Button type="button" onClick={() => setDishesOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Detail({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="font-medium">{value}</dd>
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
