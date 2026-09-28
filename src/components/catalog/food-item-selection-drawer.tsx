"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Loader2, Puzzle, Search, UtensilsCrossed } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { cn } from "cn";
import { requiredShortfalls, splitPicks } from "@/modules/menu-approvals/storefront-selection";
import type { MenuPickerData } from "@/modules/menus/menu";

/** One chosen line for a meal: a dish, an extra dish, or an add-on. */
export interface PickedItem {
  key: string;
  itemType: "MENU_ITEM" | "ADD_ON";
  catalogId: string;
  name: string;
  unitPrice: number;
  /** Extras and per-plate add-ons are charged for every guest; everything else once. */
  perGuest: boolean;
}

interface FoodItemSelectionDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menuId: string;
  menuName: string;
  /** Total guests, for pricing extras and per-plate add-ons. */
  guests: number;
  /** "VEGETARIAN" hides non-veg dishes, as on the public form. Anything else shows every dish. */
  menuPreference: string;
  initialItems: PickedItem[];
  onSave: (items: PickedItem[]) => void;
  /**
   * Item-picker parity with Order (2026-09-28) — the drawer itself has no
   * Order/Quotation-specific logic; each feature passes its own server
   * action (e.g. `getMenuForOrderPickerAction`, `getMenuForQuotationPickerAction`)
   * so the permission check stays per-feature while this component stays shared.
   */
  loadPickerData: (menuId: string) => Promise<MenuPickerData | null>;
}

const formatInr = (amount: number) => `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function FoodTypeBadge({ foodType }: { foodType: "VEGETARIAN" | "NON_VEGETARIAN" }) {
  return foodType === "VEGETARIAN" ? <Badge variant="success">Veg</Badge> : <Badge variant="danger">Non-Veg</Badge>;
}

function Thumb({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- catalog uploads are plain /uploads files, same as the rest of the app
    <img src={src} alt={alt} className="size-11 shrink-0 rounded-lg object-cover" />
  ) : (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
      <UtensilsCrossed className="size-5" />
    </span>
  );
}

function Box({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
        checked ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
      )}
      aria-hidden
    >
      {checked && <Check className="size-3.5" />}
    </span>
  );
}

/**
 * Meal Planning's food item picker, a right-hand drawer (AJ, 2026-09-27).
 * Categories on the left, dishes on the right, the same rules as the public
 * form: each category has a limit (its `maxSelection`) that has to be filled
 * before saving, dishes beyond it are Extra Items charged price x guests, and
 * Add-ons are optional. Choices are a draft until "Save Items"; Cancel throws
 * them away. Extras are derived from pick order by the same `splitPicks` the
 * storefront uses, so the two can't disagree.
 *
 * Item-picker parity with Order (2026-09-28) — moved out of orders/_components
 * into this shared catalog directory once Quotation needed the same drawer;
 * the only feature-specific piece is the `loadPickerData` prop.
 *
 * The parent renders this only while a meal is targeted, so a fresh mount
 * means fresh draft state; the only effect is the one fetch per `menuId`.
 */
export function FoodItemSelectionDrawer({
  open,
  onOpenChange,
  menuId,
  menuName,
  guests,
  menuPreference,
  initialItems,
  onSave,
  loadPickerData,
}: FoodItemSelectionDrawerProps) {
  const [data, setData] = useState<MenuPickerData | null>(null);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  // No "All Items" tab (AJ, 2026-09-28) — categories are mutually exclusive now; `effectiveCategory` below picks a default.
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(() => initialItems.filter((i) => i.itemType === "MENU_ITEM").map((i) => i.catalogId));
  const [addOnIds, setAddOnIds] = useState<string[]>(() => initialItems.filter((i) => i.itemType === "ADD_ON").map((i) => i.catalogId));
  const [extraPrompt, setExtraPrompt] = useState<{ id: string; name: string; price: number; categoryName: string; cap: number } | null>(null);

  useEffect(() => {
    startTransition(async () => {
      setData(await loadPickerData(menuId));
    });
  }, [menuId, loadPickerData]);

  const vegOnly = menuPreference === "VEGETARIAN";
  const sections = useMemo(
    () =>
      (data?.sections ?? []).map((section) => ({
        ...section,
        items: vegOnly ? section.items.filter((i) => i.foodType === "VEGETARIAN") : section.items,
      })),
    [data, vegOnly],
  );
  const split = useMemo(() => splitPicks(sections, picked), [sections, picked]);
  const extraSet = new Set(split.extraIds);
  const guestCount = Math.max(guests, 1);

  // Falls back to the first category (or Add-ons if there are none) whenever the explicitly-picked
  // tab isn't valid for the current data — memoized so it settles once data loads instead of
  // recomputing (and re-filtering the whole item list) on every unrelated re-render.
  const addOnCount = data?.addOns.length ?? 0;
  const effectiveCategory = useMemo(() => {
    const isValid = activeCategory !== null && (sections.some((s) => (s.categoryId ?? "other") === activeCategory) || (activeCategory === "ADDONS" && addOnCount > 0));
    if (isValid) return activeCategory;
    if (sections.length > 0) return sections[0].categoryId ?? "other";
    return addOnCount > 0 ? "ADDONS" : null;
  }, [activeCategory, sections, addOnCount]);

  const trimmed = search.trim().toLowerCase();
  const matches = (name: string) => !trimmed || name.toLowerCase().includes(trimmed);

  // Each capped category needs its full count of included dishes before saving.
  const shortfalls = requiredShortfalls(sections, picked);
  const canSave = shortfalls.length === 0;

  function toggleItem(item: { id: string; name: string; price: number }, sectionIndex: number) {
    if (picked.includes(item.id)) {
      setPicked((prev) => prev.filter((id) => id !== item.id));
      return;
    }
    const section = sections[sectionIndex];
    const regular = picked.filter((id) => split.sectionOfItem.get(id) === sectionIndex && !extraSet.has(id)).length;
    if (section.maxSelection !== null && regular >= section.maxSelection) {
      setExtraPrompt({ id: item.id, name: item.name, price: item.price, categoryName: section.categoryName, cap: section.maxSelection });
      return;
    }
    setPicked((prev) => [...prev, item.id]);
  }

  function toggleAddOn(id: string) {
    setAddOnIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const visibleSections = sections
    .map((section, index) => ({ section, index, items: section.items.filter((i) => matches(i.name)) }))
    .filter(({ section, items }) => items.length > 0 && (section.categoryId ?? "other") === effectiveCategory);
  const visibleAddOns = effectiveCategory === "ADDONS" ? (data?.addOns ?? []).filter((a) => matches(a.name)) : [];
  const visibleItems = visibleSections.flatMap(({ items, index }) => items.map((item) => ({ item, index })));
  const allVisibleSelected = visibleItems.length > 0 && visibleItems.every(({ item }) => picked.includes(item.id));

  function toggleSelectAll() {
    if (allVisibleSelected) {
      const remove = new Set(visibleItems.map(({ item }) => item.id));
      setPicked((prev) => prev.filter((id) => !remove.has(id)));
      return;
    }
    // Fills each category up to its limit; anything past it stays an explicit "extra" choice.
    const next = [...picked];
    const counts = new Map<number, number>();
    for (const id of next) {
      const idx = split.sectionOfItem.get(id);
      if (idx !== undefined && !extraSet.has(id)) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
    for (const { item, index } of visibleItems) {
      if (next.includes(item.id)) continue;
      const cap = sections[index].maxSelection;
      const used = counts.get(index) ?? 0;
      if (cap !== null && used >= cap) continue;
      next.push(item.id);
      counts.set(index, used + 1);
    }
    setPicked(next);
  }

  function handleSave() {
    if (!data) return;
    const byId = new Map(sections.flatMap((s) => s.items).map((i) => [i.id, i]));
    const items: PickedItem[] = [];
    for (const id of picked) {
      const known = byId.get(id);
      if (known) {
        items.push({ key: crypto.randomUUID(), itemType: "MENU_ITEM", catalogId: id, name: known.name, unitPrice: known.price, perGuest: extraSet.has(id) });
        continue;
      }
      // Kept from before but no longer offered by this Menu (or hidden by the preference): leave it as it was.
      const previous = initialItems.find((i) => i.itemType === "MENU_ITEM" && i.catalogId === id);
      if (previous) items.push(previous);
    }
    for (const id of addOnIds) {
      const addOn = data.addOns.find((a) => a.id === id);
      if (addOn) items.push({ key: crypto.randomUUID(), itemType: "ADD_ON", catalogId: id, name: addOn.name, unitPrice: addOn.price, perGuest: addOn.priceType === "PER_PLATE" });
      else {
        const previous = initialItems.find((i) => i.itemType === "ADD_ON" && i.catalogId === id);
        if (previous) items.push(previous);
      }
    }
    onSave(items);
    onOpenChange(false);
  }

  const totalSelected = picked.length;
  const railItemClass = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
      active ? "bg-accent text-accent-foreground ring-1 ring-primary/40" : "text-foreground hover:bg-muted",
    );
  // The active tab's own count carries the accent tone too (matching the reference), not just its label.
  const railBadgeClass = (active: boolean) => cn("rounded-full px-2 py-0.5 text-xs font-semibold", active ? "bg-background text-accent-foreground" : "bg-background text-muted-foreground font-normal");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 data-[side=right]:sm:max-w-4xl">
        <SheetHeader className="gap-3 border-b border-border p-5 pr-14">
          <SheetTitle className="text-lg">Select Menu Items</SheetTitle>
          <SheetDescription className="sr-only">Choose the dishes and add-ons for {menuName}.</SheetDescription>
          <div className="flex items-center gap-3">
            {data?.image ? (
              // eslint-disable-next-line @next/next/no-img-element -- catalog uploads are plain /uploads files, same as the rest of the app
              <img src={data.image} alt="" className="size-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <UtensilsCrossed className="size-6" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold">{menuName}</p>
              <p className="text-sm text-muted-foreground">{data?.description || "Select the items you want to include in this menu."}</p>
              {vegOnly && <p className="text-xs text-muted-foreground">Showing vegetarian dishes only.</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search food items…" className="w-full pl-9" />
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">
              {totalSelected} item{totalSelected === 1 ? "" : "s"} selected
            </span>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={() => {
                setPicked([]);
                setAddOnIds([]);
              }}
            >
              Clear All
            </Button>
          </div>
        </SheetHeader>

        {isPending || !data ? (
          <div className="flex flex-1 items-center justify-center py-16">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : sections.length === 0 && data.addOns.length === 0 ? (
          <p className="flex-1 py-10 text-center text-sm text-muted-foreground">This menu has no food items yet.</p>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-[11rem_minmax(0,1fr)] gap-4 p-5 sm:grid-cols-[12rem_minmax(0,1fr)]">
            {/*
              `overflow-y-auto` alone forces the browser to also compute
              overflow-x as `auto` (a scroll container can't have one axis
              clip and the other stay visible) — without padding here, that
              silently clipped the active tab's `ring-1` box-shadow along
              this container's own edges, since the ring paints outside the
              button's border box. `p-1` gives it room.
            */}
            <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto p-1" aria-label="Categories">
              {sections.map((section) => {
                const key = section.categoryId ?? "other";
                return (
                  <button key={key} type="button" onClick={() => setActiveCategory(key)} className={railItemClass(effectiveCategory === key)}>
                    <UtensilsCrossed className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{section.categoryName}</span>
                    <span className={railBadgeClass(effectiveCategory === key)}>{section.items.length}</span>
                  </button>
                );
              })}
              {data.addOns.length > 0 && (
                <button type="button" onClick={() => setActiveCategory("ADDONS")} className={railItemClass(effectiveCategory === "ADDONS")}>
                  <Puzzle className="size-4 shrink-0" />
                  <span className="flex-1 truncate">Add-ons</span>
                  <span className={railBadgeClass(effectiveCategory === "ADDONS")}>{data.addOns.length}</span>
                </button>
              )}
            </nav>

            <div className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-border p-4">
              {effectiveCategory !== "ADDONS" && (
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{sections.find((s) => (s.categoryId ?? "other") === effectiveCategory)?.categoryName ?? "Items"}</h3>
                  <button type="button" onClick={toggleSelectAll} className="flex items-center gap-2 text-sm font-medium" disabled={visibleItems.length === 0}>
                    <Box checked={allVisibleSelected} />
                    Select All
                  </button>
                </div>
              )}

              {visibleSections.length === 0 && visibleAddOns.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No food items match your search.</p>
              )}

              {visibleSections.map(({ section, index, items }) => {
                const regular = picked.filter((id) => split.sectionOfItem.get(id) === index && !extraSet.has(id)).length;
                const needed = section.maxSelection === null ? null : Math.min(section.maxSelection, section.items.length);
                const met = needed === null || regular >= needed;
                return (
                  <div key={section.categoryId ?? "other"} className="flex flex-col gap-1" data-testid={`picker-section-${section.categoryName}`}>
                    <div className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{section.categoryName}</span>
                      {needed !== null && (
                        <Badge variant={met ? "success" : "warning"}>
                          {regular}/{section.maxSelection}
                          {!met ? ` · pick ${needed - regular} more` : ""}
                        </Badge>
                      )}
                    </div>
                    <Table className="rounded-lg border border-border">
                      <TableBody>
                        {items.map((item) => {
                          const selected = picked.includes(item.id);
                          const isExtra = extraSet.has(item.id);
                          return (
                            <TableRow
                              key={item.id}
                              role="button"
                              tabIndex={0}
                              aria-pressed={selected}
                              onClick={() => toggleItem(item, index)}
                              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleItem(item, index))}
                              className="cursor-pointer"
                            >
                              <TableCell className="w-10">
                                <Box checked={selected} />
                              </TableCell>
                              <TableCell className="w-14">
                                <Thumb src={item.image} alt="" />
                              </TableCell>
                              <TableCell className="w-full max-w-0 whitespace-normal">
                                <span className="flex min-w-0 flex-col gap-1">
                                  <span className="truncate text-sm font-medium">{item.name}</span>
                                  {isExtra && (
                                    <span>
                                      <Badge variant="warning">Extra · {formatInr(item.price * guestCount)}</Badge>
                                    </span>
                                  )}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <FoodTypeBadge foodType={item.foodType} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                );
              })}

              {visibleAddOns.length > 0 && (
                <div className="flex flex-col gap-1" data-testid="picker-addons">
                  <div className="py-1">
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Add-ons (Optional)</span>
                  </div>
                  <Table className="rounded-lg border border-border">
                    <TableBody>
                      {visibleAddOns.map((addOn) => {
                        const selected = addOnIds.includes(addOn.id);
                        return (
                          <TableRow
                            key={addOn.id}
                            role="button"
                            tabIndex={0}
                            aria-pressed={selected}
                            onClick={() => toggleAddOn(addOn.id)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggleAddOn(addOn.id))}
                            className="cursor-pointer"
                          >
                            <TableCell className="w-10">
                              <Box checked={selected} />
                            </TableCell>
                            <TableCell className="w-14">
                              <Thumb src={addOn.image} alt="" />
                            </TableCell>
                            <TableCell colSpan={2} className="w-full max-w-0 whitespace-normal">
                              <span className="flex min-w-0 flex-col">
                                <span className="truncate text-sm font-medium">{addOn.name}</span>
                                <span className="text-xs text-muted-foreground">
                                  {addOn.priceType === "PER_PLATE" ? `${formatInr(addOn.price)} / plate · ${formatInr(addOn.price * guestCount)} for ${guestCount} guests` : `${formatInr(addOn.price)} flat`}
                                </span>
                              </span>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        )}

        <SheetFooter className="flex-row items-center justify-between gap-3 border-t border-border p-5">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {totalSelected} item{totalSelected === 1 ? "" : "s"} selected
              {addOnIds.length > 0 ? ` · ${addOnIds.length} add-on${addOnIds.length === 1 ? "" : "s"}` : ""}
            </p>
            {!canSave && (
              <p className="text-xs text-warning" data-testid="picker-shortfall">
                {shortfalls.map((s) => `Pick ${s.missing} more from ${s.name}`).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSave || !data} onClick={handleSave}>
              Save Items
            </Button>
          </div>
        </SheetFooter>

        <Dialog open={extraPrompt !== null} onOpenChange={(next) => !next && setExtraPrompt(null)}>
          <DialogContent className="sm:max-w-md">
            {extraPrompt && (
              <>
                <DialogHeader>
                  <DialogTitle>Add Extra Item?</DialogTitle>
                  <DialogDescription>
                    {extraPrompt.cap} item{extraPrompt.cap === 1 ? " is" : "s are"} included from “{extraPrompt.categoryName}”, and you have picked them all.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm">
                  <span className="font-semibold">{extraPrompt.name}</span> will be added as an extra item, charged for every guest: {formatInr(extraPrompt.price)} × {guestCount} guests ={" "}
                  <span className="font-semibold">{formatInr(extraPrompt.price * guestCount)}</span>.
                </p>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setExtraPrompt(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      setPicked((prev) => [...prev, extraPrompt.id]);
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
      </SheetContent>
    </Sheet>
  );
}
