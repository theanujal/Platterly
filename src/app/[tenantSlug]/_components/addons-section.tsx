"use client";

import { useState } from "react";
import { Check, Flame, Gift, Info, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormCard } from "@/components/public/form-section";
import { IconInput } from "@/components/ui/icon-input";
import { formatInr } from "@/lib/format-currency";
import { SectionHeading } from "./menu-section";
import { cn } from "cn";

export interface StorefrontAddOn {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  type: "LIVE_COUNTER" | "SPECIAL_ADD_ON";
  priceType: "PER_PLATE" | "FIXED";
  price: number;
  /** Part of the package: the customer can still pick it, but it costs nothing. */
  included: boolean;
}

interface AddOnsSectionProps {
  addOns: StorefrontAddOn[];
  guests: number;
  addOnIds: string[];
  onAddOnIdsChange: (update: (previous: string[]) => string[]) => void;
}

const GROUPS = [
  { type: "LIVE_COUNTER", title: "Live Counters", icon: Flame, searchLabel: "Search counters", note: "Cooked fresh at your venue while your guests watch." },
  { type: "SPECIAL_ADD_ON", title: "Add-ons", icon: Gift, searchLabel: "Search add-ons", note: "Extras to round out your event." },
] as const;

/**
 * Build Your Menu, part 3: optional add-ons and live counters (the old Add-ons step). Two tabs over a card grid.
 * Nothing is required and the customer can go straight to Review; what the kitchen marks "included in the package"
 * is free, everything else is charged on top of the menu price.
 */
export function AddOnsSection({ addOns, guests, addOnIds, onAddOnIdsChange }: AddOnsSectionProps) {
  const groups = GROUPS.filter((g) => addOns.some((a) => a.type === g.type));
  const [tab, setTab] = useState<(typeof GROUPS)[number]["type"]>(groups[0]?.type ?? "LIVE_COUNTER");
  const [search, setSearch] = useState("");

  function toggle(id: string) {
    onAddOnIdsChange((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const group = GROUPS.find((g) => g.type === tab)!;
  const query = search.trim().toLowerCase();
  const rows = addOns.filter((a) => a.type === tab && (!query || a.name.toLowerCase().includes(query) || (a.description ?? "").toLowerCase().includes(query)));
  const Icon = group.icon;

  if (addOns.length === 0) return null;

  return (
    <div className="flex flex-col gap-6" data-testid="addons-block">
      {(
        <FormCard className="gap-5">
          <SectionHeading number={3} title="Add-ons & Live Counters" description="Optional extras for your event. Choose any, or skip this section and continue to Review." />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div role="tablist" className="flex gap-2">
              {groups.map((g) => {
                const GroupIcon = g.icon;
                const active = g.type === tab;
                return (
                  <button
                    key={g.type}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setTab(g.type);
                      setSearch("");
                    }}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors sm:flex-none",
                      active ? "border-primary bg-accent text-primary" : "border-border bg-card text-foreground hover:bg-muted",
                    )}
                  >
                    <GroupIcon className="size-4" />
                    {g.title}
                    <span className={cn("rounded-full px-1.5 text-xs", active ? "bg-primary/15" : "bg-muted text-muted-foreground")}>{addOns.filter((a) => a.type === g.type).length}</span>
                  </button>
                );
              })}
            </div>
            <IconInput icon={Search} aria-label={group.searchLabel} placeholder={`${group.searchLabel}…`} value={search} onChange={(e) => setSearch(e.target.value)} className="sm:w-72" />
          </div>

          <p className="flex items-center gap-2 rounded-lg bg-info/10 px-3 py-2.5 text-sm text-info">
            <Info className="size-4 shrink-0" />
            {group.note} Optional, and charged on top of your menu price unless marked Included.
          </p>

          {rows.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Nothing matches your search.</p>}

          <div data-testid="addons-section" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rows.map((addOn) => {
              const selected = addOnIds.includes(addOn.id);
              return (
                <div key={addOn.id} data-testid="addon-card" className={cn("flex flex-col gap-3 rounded-xl p-3 ring-1", selected ? "bg-accent/40 ring-2 ring-primary" : "bg-card ring-foreground/15")}>
                  <div className="relative aspect-[16/9] overflow-hidden rounded-lg bg-muted">
                    {addOn.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={addOn.image} alt="" className="size-full object-cover" />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Icon className="size-8 text-muted-foreground" />
                      </div>
                    )}
                    <Badge variant={addOn.type === "LIVE_COUNTER" ? "violet" : "neutral"} className="absolute right-2 bottom-2 bg-background shadow-sm">
                      {addOn.type === "LIVE_COUNTER" ? "Live Counter" : "Add-on"}
                    </Badge>
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <h4 className="text-[15px] leading-snug font-semibold">{addOn.name}</h4>
                    {addOn.description && <p className="line-clamp-3 text-sm text-muted-foreground">{addOn.description}</p>}
                  </div>
                  {addOn.included ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <Badge variant="success">
                        <Check /> Included in Package
                      </Badge>
                      <span className="text-xs text-muted-foreground">No extra charge</span>
                    </div>
                  ) : (
                    <div className="flex flex-col">
                      <span className="text-base font-semibold text-primary">
                        {formatInr(addOn.price)} <span className="text-xs font-normal text-muted-foreground">{addOn.priceType === "PER_PLATE" ? "/ plate" : "flat"}</span>
                      </span>
                      {addOn.priceType === "PER_PLATE" && (
                        <span className="text-xs text-muted-foreground">
                          {formatInr(addOn.price * guests)} for {guests} guests
                        </span>
                      )}
                    </div>
                  )}
                  <Button type="button" size="md" variant={selected ? "default" : "outline"} className="w-full" aria-pressed={selected} aria-label={`${selected ? "Selected" : "Select"} ${addOn.name}`} onClick={() => toggle(addOn.id)}>
                    {selected && <Check />}
                    {selected ? "Selected" : "Select"}
                  </Button>
                </div>
              );
            })}
          </div>
        </FormCard>
      )}
    </div>
  );
}
