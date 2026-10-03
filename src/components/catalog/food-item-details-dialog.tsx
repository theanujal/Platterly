"use client";

import { Check, ChefHat, CookingPot, Flame, Globe, Info, Layers, Plus, Salad, Sparkles, UtensilsCrossed, Users, Wheat, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { formatInr } from "@/lib/format-currency";
import type { StorefrontMenuItem } from "@/modules/menus/menu";

interface FoodItemDetailsDialogProps {
  item: StorefrontMenuItem | null;
  categoryName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether the item is currently in the visitor's selection — flips the action between Add and Remove. */
  selected: boolean;
  onToggle: () => void;
  /** Custom Menu shows no prices at all — the kitchen quotes the plate price. */
  hidePrice?: boolean;
}

/** One icon per Additional Detail the caterer can fill in; anything new falls back to the info icon. */
const DETAIL_ICONS: Record<string, LucideIcon> = {
  Origin: Globe,
  Base: CookingPot,
  Preparation: ChefHat,
  "Spice Level": Flame,
  "Onion / Garlic": Salad,
  "Also Suits": Users,
  Texture: Layers,
  Taste: Sparkles,
  "Key Ingredients": Wheat,
};

/**
 * The "View Details" popup for a Food Item (Chunk 12, 2026-09-25; laid out again from AJ's reference 2026-10-01):
 * a small picture at the left (30%) with the name, the category and Veg tags, the price and the description beside
 * it, then every Additional Detail the caterer filled in as an icon tile (blank ones never render), and a Close and
 * Add-to/Remove-from-Selection footer. Built shared so the admin's Create Order picker can adopt it later.
 */
export function FoodItemDetailsDialog({ item, categoryName, open, onOpenChange, selected, onToggle, hidePrice }: FoodItemDetailsDialogProps) {
  if (!item) return null;
  const isVeg = item.foodType === "VEGETARIAN";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-3xl">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-[30%_minmax(0,1fr)]">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt={item.name} className="aspect-square w-full rounded-lg object-cover" />
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-muted">
              <UtensilsCrossed className="size-10 text-muted-foreground" />
            </div>
          )}

          <div className="flex min-w-0 flex-col gap-3">
            <DialogTitle className="pr-8 text-xl font-semibold">{item.name}</DialogTitle>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{categoryName ?? "Other Items"}</Badge>
              <Badge variant={isVeg ? "success" : "danger"}>{isVeg ? "Vegetarian" : "Non-Vegetarian"}</Badge>
            </div>
            {!hidePrice && (
              <div>
                <p className="text-xl font-semibold text-primary">{formatInr(item.price)}</p>
                <p className="text-xs text-muted-foreground">Charged only if this is added beyond the picks included in your menu price.</p>
              </div>
            )}
            {item.description && <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p>}
          </div>
        </div>

        {item.details.length > 0 && (
          <section className="rounded-xl border border-border p-4" aria-label="Details">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {item.details.map((row) => {
                const Icon = DETAIL_ICONS[row.label] ?? Info;
                return (
                  <div key={row.label} className="flex items-start gap-3">
                    <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <dt className="text-sm font-semibold">{row.label}</dt>
                      <dd className="text-sm text-muted-foreground">{row.value}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </section>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" className="max-sm:w-full" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
            className="max-sm:w-full"
            onClick={() => {
              onToggle();
              onOpenChange(false);
            }}
          >
            {selected ? <Check /> : <Plus />}
            {selected ? "Remove from Selection" : "Add to Selection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
