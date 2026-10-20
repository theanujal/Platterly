"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Flame, Gift, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatInr } from "@/lib/format-currency";
import { cn } from "cn";

export interface StorefrontAddOn {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  type: "LIVE_COUNTER" | "SPECIAL_ADD_ON" | "SETUP_STYLE";
  priceType: "PER_PLATE" | "FIXED";
  price: number;
  /** Part of the package: the customer can still pick it, but it costs nothing. */
  included: boolean;
  /** Offered with every menu; otherwise only with the menus in `menuIds`. */
  allMenus: boolean;
  menuIds: string[];
  /** The names of `menuIds`, for showing which menus an included add-on comes with. */
  menuNames: string[];
}

type AddOnType = StorefrontAddOn["type"];

const GROUPS: { type: AddOnType; title: string; note: string; icon: LucideIcon; single: boolean }[] = [
  { type: "LIVE_COUNTER", title: "Live Counters", note: "Freshly prepared food and beverages at your venue.", icon: Flame, single: false },
  { type: "SPECIAL_ADD_ON", title: "Add-ons", note: "Extra accompaniments and additional food options.", icon: Gift, single: false },
  { type: "SETUP_STYLE", title: "Setup Style", note: "Choose how your food and buffet should be presented.", icon: LayoutGrid, single: true },
];

/** What one add-on adds to the bill for one day of one meal: nothing when it is in the package, else flat or per guest. */
export function addOnCost(addOn: StorefrontAddOn, guests: number): number {
  if (addOn.included) return 0;
  return addOn.priceType === "PER_PLATE" ? addOn.price * guests : addOn.price;
}

interface ExtrasModalProps {
  open: boolean;
  /** Closing with the X or Escape: the picks made in the modal are dropped. */
  onClose: () => void;
  addOns: StorefrontAddOn[];
  guests: number;
  /** Event days; each extra is served every day, like the quote does. */
  days: number;
  /** The picks to start from (the ones already chosen for this meal). */
  addOnIds: string[];
  /** "Add selected extras" and "Skip extras" both end here with the final picks (none, for Skip). */
  onDone: (addOnIds: string[]) => void;
  busy?: boolean;
}

/**
 * Enhance your event (AJ, 2026-10-20): the optional Live Counters, Add-ons and Setup Style that used to sit inline under the dishes.
 * A bottom drawer on a phone and a centred modal on a bigger screen; the content scrolls on its own and the total and the
 * buttons stay at the bottom. It opens when the customer taps Continue after the dishes, never by itself, and keeps the earlier picks.
 * Setup Style is one choice; the other two groups take any number.
 */
export function ExtrasModal({ open, onClose, ...body }: ExtrasModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        data-testid="extras-modal"
        className={cn(
          // A phone: a drawer pinned to the bottom. A bigger screen: a centred modal about 760px wide.
          "top-auto bottom-0 left-0 max-h-[92dvh] w-full max-w-full translate-x-0 translate-y-0 gap-0 rounded-b-none rounded-t-2xl bg-background p-0",
          "sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[88dvh] sm:max-w-[760px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "flex flex-col",
        )}
      >
        {/* Mounted only while open, so every opening starts from the saved picks. */}
        <ExtrasBody {...body} />
      </DialogContent>
    </Dialog>
  );
}

function ExtrasBody({ addOns, guests, days, addOnIds, onDone, busy = false }: Omit<ExtrasModalProps, "open" | "onClose">) {
  const [picked, setPicked] = useState<string[]>(addOnIds);

  function toggle(addOn: StorefrontAddOn, single: boolean) {
    setPicked((prev) => {
      if (prev.includes(addOn.id)) return prev.filter((id) => id !== addOn.id);
      const sameKind = single ? new Set(addOns.filter((a) => a.type === addOn.type).map((a) => a.id)) : null;
      return [...(sameKind ? prev.filter((id) => !sameKind.has(id)) : prev), addOn.id];
    });
  }

  const groups = GROUPS.map((group) => ({ ...group, rows: addOns.filter((a) => a.type === group.type) })).filter((group) => group.rows.length > 0);
  const total = addOns.filter((a) => picked.includes(a.id)).reduce((sum, a) => sum + addOnCost(a, guests) * days, 0);

  return (
    <>
        <div className="flex flex-col gap-1 px-5 pt-5 pr-14 pb-4 sm:px-6">
          <DialogTitle className="text-xl font-semibold sm:text-2xl">Enhance your event</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">Optional extras to make your catering experience more special. You can choose any, or skip this section.</DialogDescription>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 sm:px-6" data-testid="extras-scroll">
          {groups.map((group) => {
            const GroupIcon = group.icon;
            const count = group.rows.filter((a) => picked.includes(a.id)).length;
            return (
              <section key={group.type} aria-label={group.title} data-testid={`extras-group-${group.type}`} className="flex flex-col gap-3 rounded-2xl bg-accent/40 p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
                    <GroupIcon className="size-5" />
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <h3 className="text-base leading-tight font-semibold">{group.title}</h3>
                    <p className="text-sm text-muted-foreground">{group.note}</p>
                  </div>
                  {count > 0 && <span className="shrink-0 rounded-full border border-primary/30 bg-accent px-3 py-1 text-xs font-medium text-primary">{count} selected</span>}
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {group.rows.map((addOn) => {
                    const selected = picked.includes(addOn.id);
                    return (
                      <button
                        key={addOn.id}
                        type="button"
                        data-testid="addon-card"
                        aria-pressed={selected}
                        aria-label={`${selected ? "Selected" : "Select"} ${addOn.name}`}
                        onClick={() => toggle(addOn, group.single)}
                        className={cn("flex flex-col gap-2 rounded-xl bg-card p-2 text-left ring-1 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary", selected ? "ring-2 ring-primary" : "ring-foreground/10 hover:ring-foreground/25")}
                      >
                        <span className="relative block aspect-[16/9] overflow-hidden rounded-lg bg-muted">
                          {addOn.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={addOn.image} alt="" className="size-full object-cover" />
                          ) : (
                            <span className="flex size-full items-center justify-center">
                              <GroupIcon className="size-8 text-muted-foreground" />
                            </span>
                          )}
                          <span className={cn("absolute top-2 right-2 flex size-6 items-center justify-center rounded-full border-2", selected ? "border-primary bg-primary text-primary-foreground" : "border-white bg-white/70")}>{selected && <Check className="size-3.5" strokeWidth={3} />}</span>
                        </span>
                        <span className="flex flex-col gap-0.5 px-1 pb-1">
                          <span className="text-[15px] leading-snug font-semibold">{addOn.name}</span>
                          {addOn.included ? (
                            <span className="text-sm font-semibold text-success">Included</span>
                          ) : (
                            <span className="text-sm font-semibold text-primary">
                              {formatInr(addOn.price)} <span className="font-normal text-muted-foreground">{addOn.priceType === "PER_PLATE" ? "/ plate" : group.type === "SETUP_STYLE" ? "" : "flat"}</span>
                            </span>
                          )}
                          {!addOn.included && addOn.priceType === "PER_PLATE" && (
                            <span className="text-xs text-muted-foreground">
                              {formatInr(addOn.price * guests)} for {guests} guests
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 border-t border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:rounded-b-2xl">
          <div className="flex items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:gap-0">
            <span className="text-sm text-muted-foreground">Extras total</span>
            <span className="text-2xl font-bold text-primary" data-testid="extras-total" aria-live="polite">
              {formatInr(total)}
            </span>
          </div>
          <div className="flex gap-3">
            <Button type="button" size="lg" variant="outline" className="flex-1 sm:flex-none" disabled={busy} onClick={() => onDone([])}>
              Skip extras
            </Button>
            <Button type="button" size="lg" className="flex-1 sm:flex-none" disabled={busy} onClick={() => onDone(picked)}>
              {busy ? "Saving…" : "Add selected extras"}
            </Button>
          </div>
        </div>
    </>
  );
}
