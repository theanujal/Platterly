"use client";

import { Check, Plus, Tag, UtensilsCrossed, Leaf } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

/**
 * The "View Details" popup for a Food Item (Chunk 12, 2026-09-25): image,
 * name and Veg/Non-Veg badge, three info tiles, the description, and every
 * Additional Detail the caterer filled in (blank ones never render), with a
 * Close and Add-to/Remove-from-Selection footer. Built shared so the admin's
 * Create Order picker can adopt it later.
 */
export function FoodItemDetailsDialog({ item, categoryName, open, onOpenChange, selected, onToggle, hidePrice }: FoodItemDetailsDialogProps) {
  if (!item) return null;
  const isVeg = item.foodType === "VEGETARIAN";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-5 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{item.name}</DialogTitle>
        </DialogHeader>

        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt={item.name} className="aspect-video w-full rounded-lg object-cover" />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center rounded-lg bg-muted">
            <UtensilsCrossed className="size-8 text-muted-foreground" />
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <InfoTile icon={<Leaf className="size-5 text-muted-foreground" />} label="Menu Type">
            <Badge variant={isVeg ? "success" : "danger"}>{isVeg ? "Vegetarian" : "Non-Vegetarian"}</Badge>
          </InfoTile>
          <InfoTile icon={<Tag className="size-5 text-muted-foreground" />} label="Category">
            <span className="text-sm">{categoryName ?? "Other Items"}</span>
          </InfoTile>
          {!hidePrice && (
            <InfoTile icon={<span className="text-lg font-semibold text-muted-foreground">₹</span>} label="Price">
              <span className="text-sm">{formatInr(item.price)} / plate</span>
            </InfoTile>
          )}
        </div>
        {!hidePrice && <p className="-mt-3 text-xs text-muted-foreground">Charged only if this is added beyond the picks included in your menu price.</p>}

        {item.description && (
          <section className="rounded-lg border border-border p-4">
            <h3 className="mb-1.5 text-sm font-semibold">About this item</h3>
            <p className="whitespace-pre-line text-sm leading-6 text-muted-foreground">{item.description}</p>
          </section>
        )}

        {item.details.length > 0 && (
          <section className="rounded-lg border border-border p-4">
            <h3 className="mb-2 text-sm font-semibold">Details</h3>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {item.details.map((row) => (
                <div key={row.label} className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            type="button"
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

function InfoTile({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <div className="flex size-6 shrink-0 items-center justify-center">{icon}</div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold">{label}</span>
        {children}
      </div>
    </div>
  );
}
