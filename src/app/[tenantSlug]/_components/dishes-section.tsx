"use client";

import { ItemHighlightBadges } from "@/components/catalog/item-highlights";
import { useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, CircleAlert, Eye, Layers, Search, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { IconInput } from "@/components/ui/icon-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FoodItemDetailsDialog } from "@/components/catalog/food-item-details-dialog";
import { FormCard } from "@/components/public/form-section";
import { formatInr } from "@/lib/format-currency";
import type { StorefrontMenuItem, StorefrontMenuSection } from "@/modules/menus/menu";
import { requiredShortfalls, splitPicks } from "@/modules/menu-approvals/storefront-selection";
import { useIsMobile } from "@/hooks/use-mobile";
import { SectionHeading } from "./menu-section";
import { cn } from "cn";

interface DishesSectionProps {
  menuName: string | null;
  sections: StorefrontMenuSection[];
  guests: number;
  isCustomMenu: boolean;
  itemIds: string[];
  onItemIdsChange: (update: (previous: string[]) => string[]) => void;
}

const sectionKey = (section: StorefrontMenuSection) => section.categoryId ?? "other";

/**
 * Build Your Menu, part 2: the dishes (the old Choose Items step). A big screen shows a category rail and the chosen
 * category's table; a phone shows every category as a folding section with its progress. A category past its limit
 * reads "2/2 selected + 1 extra". The "Additional Option" popup, the limits and the extra charges are unchanged.
 */
export function DishesSection({ menuName, sections, guests, isCustomMenu, itemIds, onItemIdsChange }: DishesSectionProps) {
  const compact = useIsMobile();
  const setItemIds = onItemIdsChange;
  const [detail, setDetail] = useState<{ item: StorefrontMenuItem; categoryName: string } | null>(null);
  const [extraPrompt, setExtraPrompt] = useState<{ item: StorefrontMenuItem; categoryName: string; cap: number } | null>(null);
  // Finding dishes: a search, a category (the tabs and the dropdown are one choice; it starts on the first category),
  // a diet filter, and folded sections.
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(sections[0] ? sectionKey(sections[0]) : "");
  const [foodType, setFoodType] = useState("ALL");
  // Which folding sections a phone has open. Until the customer opens or closes one, only the first category that still needs dishes is open.
  const [openKeys, setOpenKeys] = useState<Set<string> | null>(null);
  // On a big screen a category shows open unless the customer folded it.
  const [foldedKeys, setFoldedKeys] = useState<Set<string>>(new Set());

  // The very same splitter the server re-runs on save — the badges and
  // counters here can't drift from what actually gets priced.
  const split = useMemo(() => splitPicks(sections, itemIds), [sections, itemIds]);
  const sectionOfItem = useMemo(() => splitPicks(sections, []).sectionOfItem, [sections]);
  const extraSet = new Set(split.extraIds);
  const hasBothFoodTypes = useMemo(() => new Set(sections.flatMap((s) => s.items.map((i) => i.foodType))).size > 1, [sections]);
  const needle = query.trim().toLowerCase();
  const searching = needle !== "" || foodType !== "ALL";
  // A search looks through every category; otherwise the chosen category is shown.
  const visibleSections = sections
    .map((section, index) => ({
      section,
      index,
      items: section.items.filter(
        (item) =>
          (needle === "" || `${item.name} ${item.description ?? ""}`.toLowerCase().includes(needle)) && (foodType === "ALL" || item.foodType === foodType),
      ),
    }))
    .filter((entry) => (needle !== "" || compact || sectionKey(entry.section) === category) && entry.items.length > 0);

  const categoryItems = Object.fromEntries(sections.map((s) => [sectionKey(s), s.categoryName]));

  function removeItem(id: string) {
    setItemIds((prev) => prev.filter((x) => x !== id));
  }

  function toggleItem(item: StorefrontMenuItem, categoryName: string) {
    if (itemIds.includes(item.id)) return removeItem(item.id);
    const sectionIndex = sectionOfItem.get(item.id);
    const cap = sectionIndex !== undefined ? sections[sectionIndex].maxSelection : null;
    const alreadyInSection = itemIds.filter((id) => sectionOfItem.get(id) === sectionIndex && !extraSet.has(id)).length;
    if (!isCustomMenu && cap !== null && alreadyInSection >= cap) {
      setExtraPrompt({ item, categoryName, cap });
      return;
    }
    setItemIds((prev) => [...prev, item.id]);
  }

  function toggleOpen(key: string) {
    const flip = (prev: Set<string>) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    };
    if (compact) setOpenKeys((prev) => flip(prev ?? new Set([defaultOpenKey])));
    else setFoldedKeys(flip);
  }

  // What is still needed before the customer can move on (the same rule the server re-checks on save).
  const short = isCustomMenu ? [] : requiredShortfalls(sections, itemIds);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const firstNeeded = short[0] && sections.find((s) => s.categoryName === short[0].name);
  const defaultOpenKey = sectionKey(firstNeeded ?? sections[0] ?? { categoryId: null });

  function jumpTo(name: string) {
    const target = sections.find((s) => s.categoryName === name);
    if (!target) return;
    const key = sectionKey(target);
    setCategory(key);
    setQuery("");
    setOpenKeys((prev) => new Set([...(prev ?? [defaultOpenKey]), key]));
    setFoldedKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    sectionsRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  // The dishes are a table (AJ's mockup): Dish, Type, Status and the action. The mockup's Price and Quantity columns
  // are left out: a dish inside the limit is already in the plate price, and a dish is either chosen or not.
  const tableColumns = isCustomMenu ? "sm:grid-cols-[minmax(0,1fr)_4.5rem_9.5rem]" : "sm:grid-cols-[minmax(0,1fr)_4.5rem_7rem_9.5rem]";

  function renderDish(item: StorefrontMenuItem, section: StorefrontMenuSection, full: boolean) {
    const selected = itemIds.includes(item.id);
    const isExtra = extraSet.has(item.id);
    // Would this dish be charged? A chosen dish is an extra once it is past the limit; a dish not yet chosen will
    // be one when the category's included picks are already used up.
    const additional = !isCustomMenu && (selected ? isExtra : full);
    const veg = item.foodType === "VEGETARIAN";
    const typeBadge = <Badge variant={veg ? "success" : "danger"}>{veg ? "Veg" : "Non-Veg"}</Badge>;
    const status = isCustomMenu ? null : additional ? (
      <span className="flex flex-col items-start gap-0.5">
        <Badge variant="warning">Extra</Badge>
        <span className="text-xs text-muted-foreground">{formatInr(item.price)} per plate</span>
      </span>
    ) : (
      <Badge variant="success">
        <Check /> Included
      </Badge>
    );
    return (
      <div
        key={item.id}
        data-testid="item-card"
        // One copy of each cell: a phone wraps them (Type and Status sit under the name), from `sm` they are columns.
        className={cn("flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-border px-4 py-3 first:border-t-0 sm:grid sm:gap-3", tableColumns, selected && "bg-accent/50")}
      >
        <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
          {item.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.image} alt="" className="size-12 shrink-0 rounded-lg object-cover sm:size-14" />
          ) : (
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted sm:size-14">
              <UtensilsCrossed className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h4 className="text-[15px] font-semibold leading-snug">{item.name}</h4>
            <ItemHighlightBadges highlights={item.highlights} className="flex flex-wrap gap-1" />
            {item.description && <p className="line-clamp-2 text-sm text-muted-foreground">{item.description}</p>}
            {needle !== "" && <span className="text-xs text-muted-foreground">{section.categoryName}</span>}
          </div>
        </div>
        <div>{typeBadge}</div>
        {!isCustomMenu && <div>{status}</div>}
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end sm:gap-2">
          {/* Icon only from `sm` (the table is tight); the words stay on a phone. */}
          <Button type="button" variant="link" className="h-auto p-0 font-medium" aria-label="View details" title="View details" onClick={() => setDetail({ item, categoryName: section.categoryName })}>
            <Eye />
            <span className="sm:sr-only">View details</span>
          </Button>
          <Button type="button" size="md" variant={selected ? "default" : "outline"} aria-pressed={selected} onClick={() => toggleItem(item, section.categoryName)}>
            {selected && <Check />}
            {selected ? "Selected" : "Select"}
          </Button>
        </div>
      </div>
    );
  }

  const picked = split.regularIds.length + split.extraIds.length;

  return (
    <div className="flex flex-col gap-6" ref={sectionsRef} data-testid="dishes-section">
      <FormCard className="gap-5">
        <SectionHeading
          number={2}
          title={isCustomMenu ? "Build Your Custom Menu" : "Select Dishes"}
          description={
            isCustomMenu
              ? "Select any dishes you like. Our team will confirm the price per plate."
              : `${menuName ?? "Your menu"}: choose dishes from each category. Selection limits are shown for each category; extras beyond a limit are charged separately.`
          }
        />
        {sections.length === 0 && <p className="text-center text-sm text-muted-foreground">No dishes are available yet — please check back soon.</p>}

        {sections.length > 0 && (
          <div className={cn("grid gap-5", !compact && "lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-6")}>
            {/* The category rail on a big screen: one category shows at a time. A phone lists every category instead. */}
            {!compact && (
            <div role="tablist" aria-label="Categories" className="flex flex-col gap-2">
              {sections.map((section) => {
                const key = sectionKey(section);
                const active = category === key && needle === "";
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setCategory(key);
                      setQuery("");
                    }}
                    className={cn(
                      "inline-flex w-full min-h-11 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "bg-accent text-accent-foreground ring-1 ring-primary/40" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Layers className="size-4 shrink-0" />
                    <span className="flex-1 text-left">{section.categoryName}</span>
                    <CategoryProgress section={section} regular={split.regularIds.filter((id) => sectionOfItem.get(id) === sections.indexOf(section)).length} extras={split.extraIds.filter((id) => sectionOfItem.get(id) === sections.indexOf(section)).length} isCustomMenu={isCustomMenu} />
                  </button>
                );
              })}
            </div>
            )}

            <div className="flex min-w-0 flex-col gap-5">
              {/* Find dishes quickly: search, the category and diet dropdowns, and the Grid / List switch on one row. */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-48 flex-1">
                  <IconInput icon={Search} type="search" aria-label="Search dishes" placeholder="Search dishes…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                {!compact && (
                <Select items={categoryItems} value={category} onValueChange={(value) => setCategory(value ?? category)}>
                  <SelectTrigger aria-label="Filter by category" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sections.map((section) => (
                      <SelectItem key={sectionKey(section)} value={sectionKey(section)}>
                        {section.categoryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                )}
                {hasBothFoodTypes && (
                  <Select items={{ ALL: "All Types", VEGETARIAN: "Veg", NON_VEGETARIAN: "Non-Veg" }} value={foodType} onValueChange={(value) => setFoodType(value ?? "ALL")}>
                    <SelectTrigger aria-label="Filter by type" className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All Types</SelectItem>
                      <SelectItem value="VEGETARIAN">Veg</SelectItem>
                      <SelectItem value="NON_VEGETARIAN">Non-Veg</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {visibleSections.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No dishes match your search.</p>}

              {visibleSections.map(({ section, index, items }) => {
                const key = sectionKey(section);
                const regularInSection = split.regularIds.filter((id) => sectionOfItem.get(id) === index).length;
                const extrasInSection = split.extraIds.filter((id) => sectionOfItem.get(id) === index).length;
                // A search or diet filter always shows what it found, even in a folded category.
                const open = searching || (compact ? (openKeys ?? new Set([defaultOpenKey])).has(key) : !foldedKeys.has(key));
                const capped = !isCustomMenu && section.maxSelection !== null;
                const needed = capped ? Math.min(section.maxSelection ?? 0, section.items.length) : 0;
                const full = capped && regularInSection >= (section.maxSelection ?? 0);
                return (
                  <section key={key} className="flex flex-col gap-3" data-testid="item-section">
                    <button type="button" aria-expanded={open} onClick={() => toggleOpen(key)} className="flex w-full items-center gap-3 text-left">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Layers className="size-5" />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-base font-semibold">{section.categoryName}</span>
                        <span className="text-sm text-muted-foreground">
                          {capped ? `Select at least ${needed} item${needed === 1 ? "" : "s"} from this category.` : "Choose as many as you like."}
                        </span>
                      </span>
                      {capped && (
                        <Badge variant={regularInSection >= needed ? "success" : "neutral"} data-testid="category-counter">
                          {regularInSection >= needed && <Check />}
                          {regularInSection}/{section.maxSelection} selected{extrasInSection > 0 ? ` + ${extrasInSection} extra` : ""}
                        </Badge>
                      )}
                      {!capped && extrasInSection > 0 && <Badge variant="neutral">{extrasInSection} selected</Badge>}
                      {open ? <ChevronUp className="size-5 shrink-0 text-muted-foreground" /> : <ChevronDown className="size-5 shrink-0 text-muted-foreground" />}
                    </button>

                    {open && (
                      <>
                        <div className="overflow-hidden rounded-xl border border-border bg-card">
                          <div className={cn("hidden gap-3 bg-muted/60 px-4 py-2.5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase sm:grid", tableColumns)}>
                            <span>Dish</span>
                            <span>Type</span>
                            {!isCustomMenu && <span>Status</span>}
                            <span className="sr-only">Actions</span>
                          </div>
                          {items.map((item) => renderDish(item, section, full))}
                        </div>
                        {full && (
                          <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning">
                            <CircleAlert className="size-4 shrink-0" />
                            You can select only {section.maxSelection} item{section.maxSelection === 1 ? "" : "s"} from {section.categoryName} without an extra charge.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </FormCard>

      {!isCustomMenu && short.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-warning" data-testid="selection-needed">
          <CircleAlert className="size-4 shrink-0" />
          Some categories need a selection to continue:
          {short.map((entry, i) => (
            <span key={entry.name}>
              <button type="button" className="font-semibold underline underline-offset-2" onClick={() => jumpTo(entry.name)}>
                {entry.name}
              </button>
              {i < short.length - 1 ? "," : ""}
            </span>
          ))}
        </p>
      )}
      {(isCustomMenu || sections.length === 0) && picked === 0 && sections.length > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-sm text-warning">
          <CircleAlert className="size-4 shrink-0" />
          Select at least one dish to continue.
        </p>
      )}

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
              <div className="flex flex-col items-center gap-2 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <CircleAlert className="size-6" />
                </span>
                <DialogTitle className="text-xl font-semibold">{extraPrompt.item.name} is an Additional Option</DialogTitle>
              </div>
              <div className="flex flex-col gap-2 text-center text-sm text-muted-foreground">
                <p>
                  {extraPrompt.item.name} is available at an additional charge of{" "}
                  <span className="font-semibold text-foreground">{formatInr(extraPrompt.item.price * guests)}</span> (Inclusive of all {guests} guests).
                </p>
                <p>
                  Please select one of the included {extraPrompt.categoryName} options, or add {extraPrompt.item.name} by paying the additional charge.
                </p>
              </div>
              <DialogFooter className="gap-2 sm:justify-center">
                <Button type="button" variant="outline" onClick={() => setExtraPrompt(null)}>
                  Go Back
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setItemIds((prev) => [...prev, extraPrompt.item.id]);
                    setExtraPrompt(null);
                  }}
                >
                  Add {extraPrompt.item.name} (+{formatInr(extraPrompt.item.price * guests)})
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The rail's per-category progress: "1/1" with a check once complete, plus "+ k" for extras; the dish count when there is no limit. */
function CategoryProgress({ section, regular, extras, isCustomMenu }: { section: StorefrontMenuSection; regular: number; extras: number; isCustomMenu: boolean }) {
  if (isCustomMenu || section.maxSelection === null) {
    return <span className="rounded-full bg-background px-2 text-xs font-normal text-muted-foreground">{regular + extras || section.items.length}</span>;
  }
  const needed = Math.min(section.maxSelection, section.items.length);
  const done = regular >= needed;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 text-xs font-medium", done ? "bg-success/15 text-success" : "bg-background text-muted-foreground")}>
      {done && <Check className="size-3" />}
      {regular}/{section.maxSelection}
      {extras > 0 ? ` + ${extras}` : ""}
    </span>
  );
}
