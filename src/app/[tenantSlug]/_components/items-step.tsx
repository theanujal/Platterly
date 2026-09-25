"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Plus, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FoodItemDetailsDialog } from "@/components/catalog/food-item-details-dialog";
import { formatInr } from "@/lib/format-currency";
import type { StorefrontMenuItem, StorefrontMenuSection } from "@/modules/menus/menu";
import { splitPicks } from "@/modules/menu-approvals/storefront-selection";
import { saveItemsAction } from "../actions";
import { cn } from "cn";

export interface StorefrontAddOn {
  id: string;
  name: string;
  description: string | null;
  priceType: "PER_PLATE" | "FIXED";
  price: number;
}

interface ItemsStepProps {
  tenantSlug: string;
  draftId: string;
  menuName: string | null;
  sections: StorefrontMenuSection[];
  addOns: StorefrontAddOn[];
  guests: number;
  isCustomMenu: boolean;
  initialItemIds: string[];
  initialAddOnIds: string[];
}

export function ItemsStep({ tenantSlug, draftId, menuName, sections, addOns, guests, isCustomMenu, initialItemIds, initialAddOnIds }: ItemsStepProps) {
  const router = useRouter();
  const [itemIds, setItemIds] = useState<string[]>(initialItemIds);
  const [addOnIds, setAddOnIds] = useState<string[]>(initialAddOnIds);
  const [detail, setDetail] = useState<{ item: StorefrontMenuItem; categoryName: string } | null>(null);
  const [extraPrompt, setExtraPrompt] = useState<{ item: StorefrontMenuItem; categoryName: string; cap: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The very same splitter the server re-runs on save — the badges and
  // counters here can't drift from what actually gets priced.
  const split = useMemo(() => splitPicks(sections, itemIds), [sections, itemIds]);
  const sectionOfItem = useMemo(() => splitPicks(sections, []).sectionOfItem, [sections]);
  const extraSet = new Set(split.extraIds);

  function removeItem(id: string) {
    setItemIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleItem(item: StorefrontMenuItem, categoryName: string) {
    if (itemIds.includes(item.id)) return removeItem(item.id);
    const sectionIndex = sectionOfItem.get(item.id);
    const cap = sectionIndex !== undefined ? sections[sectionIndex].maxSelection : null;
    const alreadyInSection = itemIds.filter((id) => sectionOfItem.get(id) === sectionIndex).length;
    if (!isCustomMenu && cap !== null && alreadyInSection >= cap) {
      setExtraPrompt({ item, categoryName, cap });
      return;
    }
    setItemIds((prev) => [...prev, item.id]);
  }

  function toggleAddOn(id: string) {
    setAddOnIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleContinue() {
    setError(null);
    if (itemIds.length === 0) {
      setError("Please select at least one menu item.");
      return;
    }
    setPending(true);
    const result = await saveItemsAction(tenantSlug, draftId, itemIds, addOnIds);
    if (!result.ok) {
      setPending(false);
      setError(result.error);
      return;
    }
    router.push(`/${tenantSlug}/plan/${draftId}?step=venue`);
  }

  return (
    <div className="flex flex-col gap-8 pb-28">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{isCustomMenu ? "Build Your Custom Menu" : "Choose Your Menu Items"}</h2>
        <p className="text-sm text-muted-foreground">
          {isCustomMenu
            ? "Select any dishes you like — our team will confirm the price per plate."
            : `${menuName ?? "Your menu"} — pick your dishes from each category. Extras beyond a category's limit are charged separately.`}
        </p>
      </div>

      {sections.length === 0 && <p className="text-center text-sm text-muted-foreground">No dishes are available yet — please check back soon.</p>}

      {sections.map((section) => {
        const regularInSection = split.regularIds.filter((id) => sectionOfItem.get(id) === sections.indexOf(section)).length;
        return (
          <section key={section.categoryId ?? "other"} className="flex flex-col gap-3" data-testid="item-section">
            <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{section.categoryName}</h3>
              {!isCustomMenu && section.maxSelection !== null && (
                <Badge variant={regularInSection >= section.maxSelection ? "success" : "neutral"} data-testid="category-counter">
                  {regularInSection}/{section.maxSelection}
                </Badge>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {section.items.map((item) => {
                const selected = itemIds.includes(item.id);
                const isExtra = extraSet.has(item.id);
                return (
                  <Card key={item.id} className={cn("overflow-hidden py-0", selected && "border-primary ring-primary")} data-testid="item-card">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt="" className="aspect-video w-full object-cover" />
                    ) : (
                      <div className="flex aspect-video w-full items-center justify-center bg-muted">
                        <UtensilsCrossed className="size-6 text-muted-foreground" />
                      </div>
                    )}
                    <CardContent className="flex flex-col gap-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-sm font-semibold">{item.name}</h4>
                        <Badge variant={item.foodType === "VEGETARIAN" ? "success" : "danger"}>{item.foodType === "VEGETARIAN" ? "Veg" : "Non-Veg"}</Badge>
                      </div>
                      {item.description && <p className="line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}
                      <div>
                        <Button type="button" variant="link" className="h-auto p-0 font-semibold" onClick={() => setDetail({ item, categoryName: section.categoryName })}>
                          View details
                        </Button>
                      </div>
                      <div className="flex items-center justify-between gap-2 pt-1">
                        {isExtra ? <Badge variant="warning">Extra · {formatInr(item.price * guests)}</Badge> : <span />}
                        <Button type="button" size="md" variant={selected ? "outline" : "default"} onClick={() => toggleItem(item, section.categoryName)} aria-pressed={selected}>
                          {selected ? <Check /> : <Plus />}
                          {selected ? "Remove" : "Add"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}

      {addOns.length > 0 && (
        <section className="flex flex-col gap-3" data-testid="addons-section">
          <div className="border-b border-border pb-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Add-ons (Optional)</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {addOns.map((addOn) => {
              const selected = addOnIds.includes(addOn.id);
              return (
                <button
                  key={addOn.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleAddOn(addOn.id)}
                  className={cn("flex items-start gap-3 rounded-xl border p-3 text-left transition-colors", selected ? "border-primary bg-accent" : "border-border hover:border-primary/50")}
                >
                  <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border", selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                    {selected && <Check className="size-3.5" />}
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">{addOn.name}</span>
                    {addOn.description && <span className="line-clamp-2 text-xs text-muted-foreground">{addOn.description}</span>}
                    <span className="text-xs font-semibold text-primary">
                      {formatInr(addOn.price)} {addOn.priceType === "PER_PLATE" ? `/ plate · ${formatInr(addOn.price * guests)} for ${guests} guests` : "flat"}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => router.push(`/${tenantSlug}/plan/${draftId}?step=menu`)}>
            <ArrowLeft /> Back
          </Button>
          <span className="text-sm text-muted-foreground" data-testid="selection-summary">
            {itemIds.length} item{itemIds.length === 1 ? "" : "s"} selected{addOnIds.length > 0 ? ` · ${addOnIds.length} add-on${addOnIds.length === 1 ? "" : "s"}` : ""}
          </span>
          <Button type="button" disabled={pending} onClick={handleContinue}>
            {pending ? "Saving…" : "Continue"}
            <ArrowRight />
          </Button>
        </div>
      </div>

      <FoodItemDetailsDialog
        item={detail?.item ?? null}
        categoryName={detail?.categoryName}
        open={detail !== null}
        onOpenChange={(open) => !open && setDetail(null)}
        selected={detail ? itemIds.includes(detail.item.id) : false}
        onToggle={() => detail && toggleItem(detail.item, detail.categoryName)}
        hidePrice={isCustomMenu}
      />

      <Dialog open={extraPrompt !== null} onOpenChange={(open) => !open && setExtraPrompt(null)}>
        <DialogContent className="gap-4 sm:max-w-md">
          {extraPrompt && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-primary">Add Extra Item?</DialogTitle>
              </DialogHeader>
              <p className="text-sm">
                You have already selected the maximum number of items ({extraPrompt.cap}) from the <span className="font-semibold">“{extraPrompt.categoryName}”</span> category.
              </p>
              <div className="rounded-lg border border-info/30 bg-info/10 p-4 text-sm text-info">
                <p className="mb-1 font-semibold">Extra Item Pricing:</p>
                <p>
                  <span className="font-semibold">{extraPrompt.item.name}</span> will be added as an extra item.
                </p>
                <p className="mt-2">
                  Cost: {formatInr(extraPrompt.item.price)} × {guests} guests = <span className="font-bold">{formatInr(extraPrompt.item.price * guests)}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">This will be added to your total cost in addition to the per-plate price for your selected items.</p>
              <DialogFooter className="sm:justify-end">
                <Button type="button" variant="outline" onClick={() => setExtraPrompt(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setItemIds((prev) => [...prev, extraPrompt.item.id]);
                    setExtraPrompt(null);
                  }}
                >
                  Add as Extra Item
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
