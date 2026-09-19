"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Search, Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "cn";
import { getMenuForOrderPickerAction } from "../actions";
import type { OrderPickerMenu } from "@/modules/menus/menu";

export interface FoodItemSelectionValue {
  id: string;
  name: string;
  price: number;
}

interface FoodItemSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuId: string;
  menuName: string;
  selectedIds: Set<string>;
  onToggle: (item: FoodItemSelectionValue) => void;
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

/**
 * Create Order redesign (2026-09-20) — the "Select Food Items" step of
 * Meal Planning's Select Meal → Assign Menu → Select Food Items flow.
 * Fetches the assigned Menu's own category-grouped items on demand
 * (getMenuForOrderPickerAction) rather than the form preloading every
 * Menu's items up front. Selection is a plain toggle (no quantity — AJ,
 * 2026-09-20), and each category enforces its own MenuCategoryAssignment
 * `maxSelection` cap client-side, matching the reference screenshot's
 * "0/2" counter.
 *
 * The parent (order-form.tsx) only ever renders this component while a meal
 * is actively targeted — closing it unmounts the element entirely — so a
 * fresh mount already means fresh `search`/`activeCategory` state; the only
 * thing this needs to do itself is fetch once per `menuId`. Fetching inside
 * `startTransition` (not a plain `useState` + manual `setLoading(true)`)
 * mirrors `customer-combobox.tsx`'s own established pattern: `isPending`
 * doubles as the loading flag, and every `setState` call happens after an
 * `await` rather than synchronously in the effect body, which is what
 * `react-hooks/set-state-in-effect` actually flags.
 */
export function FoodItemSelectionDialog({ open, onOpenChange, menuId, menuName, selectedIds, onToggle }: FoodItemSelectionDialogProps) {
  const [menu, setMenu] = useState<OrderPickerMenu | null>(null);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  useEffect(() => {
    startTransition(async () => {
      const result = await getMenuForOrderPickerAction(menuId);
      setMenu(result);
    });
  }, [menuId]);

  const trimmedSearch = search.trim().toLowerCase();
  const visibleSections = useMemo(() => {
    if (!menu) return [];
    return menu.sections
      .filter((section) => activeCategory === "ALL" || (section.categoryId ?? "other") === activeCategory)
      .map((section) => ({
        ...section,
        items: trimmedSearch ? section.items.filter((item) => item.name.toLowerCase().includes(trimmedSearch)) : section.items,
      }))
      .filter((section) => section.items.length > 0);
  }, [menu, activeCategory, trimmedSearch]);

  const totalSelectedInMenu = menu ? menu.sections.reduce((sum, s) => sum + s.items.filter((i) => selectedIds.has(i.id)).length, 0) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select Food Items — {menuName}</DialogTitle>
        </DialogHeader>

        {isPending ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !menu || menu.sections.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">This menu has no food items yet.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search food items…"
                  className="w-full pl-9"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory("ALL")}
                  className={cn(
                    "flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                    activeCategory === "ALL" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                  )}
                >
                  Show All
                </button>
                {menu.sections.map((section) => {
                  const key = section.categoryId ?? "other";
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveCategory(key)}
                      className={cn(
                        "flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors",
                        activeCategory === key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70",
                      )}
                    >
                      {section.categoryName}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto py-1">
              {visibleSections.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No food items match your search.</p>
              ) : (
                visibleSections.map((section) => {
                  const selectedInSection = section.items.filter((i) => selectedIds.has(i.id)).length;
                  const capReached = section.maxSelection !== null && selectedInSection >= section.maxSelection;
                  return (
                    <div key={section.categoryId ?? "other"} className="flex flex-col gap-2.5 rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                            {selectedInSection}
                          </span>
                          <span className="text-sm font-semibold">{section.categoryName}</span>
                        </div>
                        {section.maxSelection !== null && (
                          <Badge variant={capReached ? "warning" : "neutral"}>
                            {selectedInSection}/{section.maxSelection}
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {section.items.map((item) => {
                          const selected = selectedIds.has(item.id);
                          const disabled = !selected && capReached;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={disabled}
                              onClick={() => onToggle(item)}
                              className={cn(
                                "flex flex-col items-start gap-0.5 rounded-lg border p-3 text-left transition-colors",
                                selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                                disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
                              )}
                            >
                              <div className="flex w-full items-start justify-between gap-1.5">
                                <span className="text-sm font-medium">{item.name}</span>
                                {selected && (
                                  <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    <Check className="size-3" />
                                  </span>
                                )}
                              </div>
                              <span className="text-xs font-medium text-primary">{formatCurrency(item.price)}/plate</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="text-sm text-muted-foreground">
            {totalSelectedInMenu} item{totalSelectedInMenu === 1 ? "" : "s"} selected
          </span>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
