"use client";

import { createElement, useEffect, useMemo, useState } from "react";
import { CalendarDays, Cake, ChevronDown, CirclePlus, Coffee, ConciergeBell, Copy, CupSoda, Leaf, Moon, PenSquare, Plus, Salad, Soup, Sun, Sunrise, Trash2, Utensils, UtensilsCrossed, Wheat, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FoodItemSelectionDrawer, type PickedItem } from "@/components/catalog/food-item-selection-drawer";
import type { MenuPickerData } from "@/modules/menus/menu";
import { cn } from "cn";

/**
 * Event Dates sidebar + per-meal detail panel (AJ, 2026-09-29) — shared by
 * Order's and Quotation's "Menu Planning" step (they used to each declare
 * their own near-identical MealSelection/mealMap/renderDayMeals). Replaces
 * the old design (every date's meals shown inline, or in separate "Event N"
 * blocks for Multi Order) with one date focused at a time via a left list —
 * only rendered when there's more than one day; a single-day event skips the
 * sidebar entirely and shows its meal tabs/cards directly. Order Kind
 * (Single/Multi) still exists as its own step and still auto-switches on a
 * date range or 2nd meal type, but no longer changes how this section itself
 * renders.
 */

export const MEAL_TYPES = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "HITEA", label: "Hi-Tea" },
  { value: "DINNER", label: "Dinner" },
  { value: "OTHER", label: "Other" },
] as const;

export type MealTypeValue = (typeof MEAL_TYPES)[number]["value"];

export const MEAL_ICON: Record<MealTypeValue, LucideIcon> = {
  BREAKFAST: Sunrise,
  LUNCH: Sun,
  HITEA: Coffee,
  DINNER: Moon,
  OTHER: UtensilsCrossed,
};

export interface MenuOption {
  id: string;
  name: string;
  menuType: "VEGETARIAN" | "NON_VEGETARIAN";
  price: number;
  childUnder5Chargeable: boolean;
  childUnder5Price: number | null;
  child5To10PricingType: "PERCENTAGE" | "FIXED";
  child5To10PriceValue: number | null;
}

export interface MealSelection {
  date: string;
  mealType: MealTypeValue;
  price: string;
  /** Required before food items can be picked — every meal assigns its own Menu, regardless of Order/Quotation Kind. */
  menuId: string;
  /** Items chosen from that meal's own Menu. */
  items: PickedItem[];
}

function formatDay(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", opts);
}

function formatCurrency(amount: number) {
  return `₹${amount.toFixed(2)}`;
}

/**
 * Marks for the Menu Approvals version view's Compare toggle: dishes present here but not in the other menu get
 * `highlightLabel`, and dishes the other menu has that this one lacks are listed struck-through under the meal.
 * Keys are `date|mealType|catalogId` and `date|mealType`.
 */
export interface ComparisonMarks {
  highlight: Set<string>;
  highlightLabel: string;
  missing: Record<string, { name: string; catalogId: string }[]>;
  missingLabel: string;
}

interface MenuPlanningSectionProps {
  /** Distinguishes generated element ids ("order-..." / "quote-...") without changing either form's own id conventions. */
  idPrefix: string;
  /** e2e's existing `meal-slot-{date}-{mealType}` testid has no prefix on Order; Quotation's has always been `quote-meal-slot-...`. Defaults to "". */
  mealSlotTestIdPrefix?: string;
  days: string[];
  mealPlanEntries: MealSelection[];
  onChange: (entries: MealSelection[]) => void;
  menus: MenuOption[];
  menuPreference: string;
  onMenuPreferenceChange: (preference: string) => void;
  individualPricingEnabled: boolean;
  guestsForPricing: number;
  loadPickerData: (menuId: string) => Promise<MenuPickerData | null>;
  /**
   * Lifted to the parent (not internal state) so the "Selected Meals" summary
   * card in the right-hand column — which lives outside this component and
   * shows every date at a glance — can also open the drawer directly for a
   * date that isn't the one currently focused in the sidebar.
   */
  foodDialogTarget: { date: string; mealType: MealTypeValue } | null;
  onOpenFoodDialog: (date: string, mealType: MealTypeValue) => void;
  onCloseFoodDialog: () => void;
  /**
   * Shows the plan without editing (Menu Approvals' older-version view, or a menu that is with the customer):
   * no meal toggles, Remove, Copy to other dates, menu / price inputs or food-item drawer — just the dates, meals and dishes.
   */
  readOnly?: boolean;
  compare?: ComparisonMarks;
  /**
   * Menu Approval tab layout (AJ, 2026-10-16): "1. Menu Preference" and "2. Event Dates & Meals" as two cards, and the dates list shown even
   * for a single day. Without it the section renders exactly as before, for Create Order and Quotations.
   */
  sectioned?: boolean;
  /** Days that carry meals but fall outside the order's event dates (e.g. the date was changed after the menu was planned): flagged in the dates list. */
  outsideDays?: string[];
  /**
   * Menu Approval tab: says what order type a meal list would give, so adding or removing a meal that flips Single / Multi asks first.
   * The order type itself is updated by the save (updateMenuApprovalMealPlan).
   */
  kindOf?: (entries: MealSelection[]) => "SINGLE" | "MULTI";
  /** Menu Approval tab: the plan always keeps one meal, so the last one can't be removed. */
  keepOneMeal?: boolean;
  /**
   * Per-plate prices are set in the order's Pricing Details (Individual / Custom Pricing), so a meal card only shows its price as text
   * instead of a number box. Quotations, which have no such card, leave this off and keep the box.
   */
  priceInPricingTab?: boolean;
  /** The viewer may not see prices (Sensitive data: orderPrices): no price box, no amounts in the dish drawer. The server also sends none. */
  hidePrices?: boolean;
}

/** One numbered card of the `sectioned` layout. */
function PlanSection({ step, title, description, icon: Icon, children }: { step: number; title: string; description: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <Card className="gap-4 overflow-visible px-5 [--card-spacing:--spacing(5)]">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">
            {step}. {title}
          </h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </Card>
  );
}

export function MenuPlanningSection({
  idPrefix,
  mealSlotTestIdPrefix = "",
  days,
  mealPlanEntries,
  onChange,
  menus,
  menuPreference,
  onMenuPreferenceChange,
  individualPricingEnabled,
  guestsForPricing,
  loadPickerData,
  foodDialogTarget,
  onOpenFoodDialog,
  onCloseFoodDialog,
  readOnly = false,
  compare,
  sectioned = false,
  outsideDays = [],
  kindOf,
  keepOneMeal = false,
  priceInPricingTab = false,
  hidePrices = false,
}: MenuPlanningSectionProps) {
  const [focusedDate, setFocusedDate] = useState<string | null>(days[0] ?? null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);
  // A meal with anything in it is only removed after "Are you sure?"; an empty one goes at once.
  const [pendingRemove, setPendingRemove] = useState<{ date: string; mealType: MealTypeValue } | null>(null);
  // A meal that makes the order a Multi Order is added only after "Are you sure?".
  const [pendingAdd, setPendingAdd] = useState<{ date: string; mealType: MealTypeValue } | null>(null);

  // The focused date drops out of range (e.g. the event date range shrank) — fall back to the first day rather than showing nothing.
  const activeDate = focusedDate && days.includes(focusedDate) ? focusedDate : (days[0] ?? null);

  const mealMap = useMemo(() => {
    const map = new Map<string, MealSelection>();
    for (const entry of mealPlanEntries) map.set(`${entry.date}|${entry.mealType}`, entry);
    return map;
  }, [mealPlanEntries]);

  function toggleMeal(date: string, mealType: MealTypeValue) {
    if (mealMap.has(`${date}|${mealType}`)) {
      setFocusedDate(date);
      return;
    }
    const next = [...mealPlanEntries, { date, mealType, price: "", menuId: "", items: [] }];
    if (kindOf && kindOf(next) !== kindOf(mealPlanEntries)) {
      setPendingAdd({ date, mealType });
      return;
    }
    addMeal(date, mealType);
  }

  function addMeal(date: string, mealType: MealTypeValue) {
    onChange([...mealPlanEntries, { date, mealType, price: "", menuId: "", items: [] }]);
    setFocusedDate(date);
  }

  function requestRemoveMeal(date: string, mealType: MealTypeValue) {
    const entry = mealMap.get(`${date}|${mealType}`);
    // On the Menu Approval tab every removal asks (it can change the order type); elsewhere an empty meal goes at once.
    if (entry && (kindOf || entry.menuId || entry.price.trim() || entry.items.length > 0)) setPendingRemove({ date, mealType });
    else removeMeal(date, mealType);
  }

  function removeMeal(date: string, mealType: MealTypeValue) {
    onChange(mealPlanEntries.filter((e) => !(e.date === date && e.mealType === mealType)));
  }

  function setMealMenu(date: string, mealType: MealTypeValue, menuId: string) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, menuId, items: [], ...(priceInPricingTab && individualPricingEnabled ? { price: String(menus.find((m) => m.id === menuId)?.price ?? "") } : {}) } : e)));
  }

  function setMealPrice(date: string, mealType: MealTypeValue, price: string) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, price } : e)));
  }

  function setMealItems(date: string, mealType: MealTypeValue, items: PickedItem[]) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, items } : e)));
  }

  /** Chip-list "x" — removes by row key rather than re-deriving the catalog option. */
  function removeMealItem(date: string, mealType: MealTypeValue, itemKey: string) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, items: e.items.filter((i) => i.key !== itemKey) } : e)));
  }

  function applyCopy() {
    if (!activeDate || copyTargets.length === 0) return;
    const focusedEntries = mealPlanEntries.filter((e) => e.date === activeDate);
    const targetSet = new Set(copyTargets);
    const withoutOverwritten = mealPlanEntries.filter((e) => !(targetSet.has(e.date) && focusedEntries.some((fe) => fe.mealType === e.mealType)));
    const additions = copyTargets.flatMap((date) => focusedEntries.map((fe) => ({ ...fe, date })));
    onChange([...withoutOverwritten, ...additions]);
    setCopyOpen(false);
    setCopyTargets([]);
  }

  const otherDays = days.filter((d) => d !== activeDate);
  const activeDateHasMeals = activeDate ? mealPlanEntries.some((e) => e.date === activeDate) : false;

  const dayMeals = (date: string) => MEAL_TYPES.filter((m) => mealMap.has(`${date}|${m.value}`));

  function mealCard(date: string, mealType: MealTypeValue) {
    const entry = mealMap.get(`${date}|${mealType}`)!;
    const meal = MEAL_TYPES.find((m) => m.value === mealType)!;
    const assignedMenu = menus.find((m) => m.id === entry.menuId);
    return (
      <div
        key={mealType}
        data-testid={`${mealSlotTestIdPrefix}meal-slot-${date}-${mealType}`}
        className={cn("flex flex-col gap-3 rounded-lg border border-primary/40 bg-accent/40 p-3 sm:p-4", sectioned && "gap-4 rounded-2xl border-primary/20 bg-gradient-to-b from-primary/[0.06] to-transparent")}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={cn("flex items-center gap-2 text-sm font-semibold", sectioned && "gap-3 text-lg font-bold")}>
            <span className={cn("flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary", sectioned && "size-12 rounded-xl")}>
              {createElement(MEAL_ICON[mealType], { className: sectioned ? "size-6" : "size-4" })}
            </span>
            {meal.label}
          </span>
          {!readOnly && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive"
              disabled={keepOneMeal && mealPlanEntries.length <= 1}
              title={keepOneMeal && mealPlanEntries.length <= 1 ? "An order needs at least one meal" : undefined}
              onClick={() => requestRemoveMeal(date, mealType)}
            >
              <Trash2 className="size-3.5" />
              Remove {meal.label}
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-meal-menu-${date}-${mealType}`} required className="text-xs">
              Menu
            </Label>
            {readOnly ? (
              <div className="flex h-10 items-center rounded-lg border border-input bg-muted px-3 text-sm">{assignedMenu?.name ?? "No menu assigned"}</div>
            ) : (
              <Select
                items={Object.fromEntries(menus.map((m) => [m.id, m.name]))}
                value={entry.menuId}
                onValueChange={(v) => setMealMenu(date, mealType, v ?? "")}
                // A menu is picked from the list for the chosen Menu Preference, so choose Vegetarian or Non-Vegetarian first (a meal that already has a menu stays editable).
                disabled={!menuPreference && !entry.menuId}
              >
                <SelectTrigger id={`${idPrefix}-meal-menu-${date}-${mealType}`} className="w-full">
                  <SelectValue placeholder={!menuPreference && !entry.menuId ? "Choose Menu Preference first" : "Select Menu"} />
                </SelectTrigger>
                <SelectContent>
                  {menus
                    .filter((m) => !menuPreference || m.menuType === menuPreference || m.id === entry.menuId)
                    .map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {!hidePrices && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-meal-price-${date}-${mealType}`} className="text-xs">
              Price
            </Label>
            {individualPricingEnabled && !readOnly && !priceInPricingTab ? (
              <div className="flex items-center gap-2">
                <Input
                  id={`${idPrefix}-meal-price-${date}-${mealType}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={entry.price}
                  onChange={(e) => setMealPrice(date, mealType, e.target.value)}
                />
                <span className="shrink-0 text-xs text-muted-foreground">/ plate</span>
              </div>
            ) : (
              <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-muted px-3 text-sm">
                <span>
                  {individualPricingEnabled
                    ? entry.price
                      ? formatCurrency(Number(entry.price))
                      : "—"
                    : assignedMenu
                      ? formatCurrency(assignedMenu.price)
                      : "—"}
                </span>
                <span className="text-xs text-muted-foreground">/ plate</span>
              </div>
            )}
          </div>
          )}
        </div>

        {(entry.menuId || (readOnly && entry.items.length > 0)) && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <span className={cn("font-medium", sectioned && "text-base font-semibold")}>Food Items</span>
                {sectioned && entry.items.length > 0 && <span className="mx-2 inline-block size-1.5 rounded-full bg-primary align-middle" aria-hidden />}
                <span className={cn("ml-2 text-muted-foreground", sectioned && entry.items.length > 0 && "ml-0")}>
                  {entry.items.length === 0 ? "No items selected" : `${entry.items.length} item${entry.items.length === 1 ? "" : "s"} selected`}
                </span>
              </span>
              {!readOnly && (
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenFoodDialog(date, mealType)}>
                  {entry.items.length === 0 ? <Plus className="size-3.5" /> : <PenSquare className="size-3.5" />}
                  {entry.items.length === 0 ? "Select Food Items" : "Edit Items"}
                </Button>
              )}
            </div>
            {/* Menu Approval tab (AJ, 2026-10-19): every dish the customer picked, under its category, instead of just counts. */}
            {sectioned && !compare && entry.items.length > 0 && <MealDishes items={entry.items} menuId={entry.menuId} loadPickerData={loadPickerData} />}
            {entry.items.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1.5" data-testid="meal-item-counts">
                  {/* Counts, not names (AJ, 2026-10-10). Menu Approvals' version compare still lists names so added and removed dishes can be marked. */}
                  {!compare && <ItemCountPills items={entry.items} />}
                  {compare && entry.items.map((item) => {
                    const highlighted = compare?.highlight.has(`${date}|${mealType}|${item.catalogId}`);
                    return (
                      <Badge key={item.key} variant="outline" className={cn("gap-1", !readOnly && "pr-1", highlighted && "border-warning/60 bg-warning/10")}>
                        {item.name}
                        {item.itemType === "ADD_ON" ? (
                          <span className="text-primary">Add-on</span>
                        ) : item.perGuest ? (
                          <span className="text-warning">Extra</span>
                        ) : null}
                        {highlighted && compare && <span className="font-medium text-warning">{compare.highlightLabel}</span>}
                        {!readOnly && (
                          <button
                            type="button"
                            aria-label={`Remove ${item.name}`}
                            onClick={() => removeMealItem(date, mealType, item.key)}
                            className="rounded-full p-0.5 hover:bg-muted"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        )}
                      </Badge>
                    );
                  })}
                  {compare && (compare.missing[`${date}|${mealType}`] ?? []).map((gone) => (
                    <Badge key={`missing-${gone.catalogId}`} variant="outline" className="gap-1 border-dashed border-info/60 text-info">
                      <span className="line-through opacity-70">{gone.name}</span>
                      <span className="font-medium">{compare?.missingLabel}</span>
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function mealTypeTabs(date: string) {
    if (readOnly) return dayMeals(date).length === 0 ? <p className="text-sm text-muted-foreground">No meals planned for this date.</p> : null;
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label="Meals for this date">
        {MEAL_TYPES.map((meal) => {
          const selected = mealMap.has(`${date}|${meal.value}`);
          return (
            <button
              key={meal.value}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleMeal(date, meal.value)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-lg border px-2 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-primary bg-accent/40 text-primary" : "border-input hover:bg-muted",
              )}
            >
              {createElement(MEAL_ICON[meal.value], { className: cn("size-4", selected ? "text-primary" : "text-muted-foreground") })}
              {meal.label}
            </button>
          );
        })}
      </div>
    );
  }

  const foodDialogEntry = foodDialogTarget ? mealMap.get(`${foodDialogTarget.date}|${foodDialogTarget.mealType}`) : undefined;
  const foodDialogMenu = foodDialogEntry ? menus.find((m) => m.id === foodDialogEntry.menuId) : undefined;

  const removeEntry = pendingRemove ? mealMap.get(`${pendingRemove.date}|${pendingRemove.mealType}`) : undefined;
  const removeLabel = pendingRemove ? (MEAL_TYPES.find((m) => m.value === pendingRemove.mealType)?.label ?? "") : "";
  const removeCount = removeEntry?.items.length ?? 0;
  const afterRemove = pendingRemove ? mealPlanEntries.filter((e) => !(e.date === pendingRemove.date && e.mealType === pendingRemove.mealType)) : [];
  const removeKindNote =
    kindOf && pendingRemove && kindOf(afterRemove) !== kindOf(mealPlanEntries)
      ? kindOf(afterRemove) === "SINGLE"
        ? " With only one meal type left, this becomes a Single Order."
        : " This becomes a Multi Order."
      : "";
  const addLabel = pendingAdd ? (MEAL_TYPES.find((m) => m.value === pendingAdd.mealType)?.label ?? "") : "";

  const preferenceControl = readOnly ? null : (
<div className="flex flex-col gap-1.5" role="group" aria-label="Menu Preference">
          {!sectioned && <Label>Menu Preference</Label>}
          <div className="flex flex-wrap gap-3">
            {(
              [
                { value: "VEGETARIAN", label: "Vegetarian", hint: "Vegetarian menus and dishes only" },
                { value: "NON_VEGETARIAN", label: "Non-Vegetarian", hint: "Every menu and dish" },
              ] as const
            ).map((option) => {
              const selected = menuPreference === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onMenuPreferenceChange(option.value)}
                  className={cn(
                    "flex min-w-44 flex-1 items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    selected ? "border-primary bg-accent/40" : "border-input hover:bg-muted",
                  )}
                >
                  <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-input")}>
                    {selected && <span className="size-2.5 rounded-full bg-primary" />}
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
  );

  const datesAndMeals = (
    <>
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Set the Event Date above to start planning meals.</p>
      ) : days.length === 1 && !sectioned ? (
        <div className="flex flex-col gap-3">
          {mealTypeTabs(days[0])}
          {dayMeals(days[0]).length > 0 && <div className="flex flex-col gap-3">{dayMeals(days[0]).map((m) => mealCard(days[0], m.value))}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <nav className={cn("flex flex-row gap-1.5 overflow-x-auto md:flex-col md:overflow-x-visible", !sectioned && "rounded-xl border border-border p-2")} aria-label="Event Dates">
            {!sectioned && <span className="hidden px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:block">Event Dates</span>}
            {days.map((date) => {
              const meals = dayMeals(date);
              const isFocused = date === activeDate;
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setFocusedDate(date)}
                  className={cn(
                    "flex min-w-44 shrink-0 flex-col gap-0.5 rounded-lg border-l-2 px-3 py-2 text-left transition-colors md:min-w-0 md:shrink",
                    isFocused ? "border-primary bg-accent/50" : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn("size-2 shrink-0 rounded-full", isFocused ? "bg-primary" : meals.length > 0 ? "bg-primary/40" : "bg-border")} />
                    <span className={cn("text-sm font-medium", isFocused && "text-primary")}>
                      {formatDay(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </span>
                  <span className="pl-4 text-xs text-muted-foreground">{meals.length > 0 ? meals.map((m) => m.label).join(", ") : "No meals selected"}</span>
                  {outsideDays.includes(date) && <span className="pl-4 text-xs font-medium text-warning">Outside the event dates</span>}
                </button>
              );
            })}
          </nav>

          {activeDate && (
            <div className={cn("flex min-w-0 flex-col gap-4", !sectioned && "rounded-xl border border-border p-3 sm:p-4")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{formatDay(activeDate, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</h3>
                  <p className="text-sm text-muted-foreground">{readOnly ? "Meals planned for this date." : "Select and configure meals for this date."}</p>
                  {outsideDays.includes(activeDate) && (
                    <p className="mt-1 text-sm text-warning">This date is outside the order&apos;s event dates, so it is not shown on the order. These meals are still priced; remove them if they are not needed.</p>
                  )}
                </div>
                {!readOnly && otherDays.length > 0 && (
                  <Popover
                    open={copyOpen}
                    onOpenChange={(open) => {
                      setCopyOpen(open);
                      if (!open) setCopyTargets([]);
                    }}
                  >
                    <PopoverTrigger
                      type="button"
                      disabled={!activeDateHasMeals}
                      className="flex h-9 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Copy className="size-4" />
                      Copy to other dates
                      <ChevronDown className="size-3.5" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64">
                      <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Copy this date&apos;s meals to</p>
                      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                        {otherDays.map((date) => (
                          <label key={date} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-muted/60">
                            <Checkbox
                              checked={copyTargets.includes(date)}
                              onCheckedChange={(c) => setCopyTargets((prev) => (c === true ? [...prev, date] : prev.filter((d) => d !== date)))}
                            />
                            {formatDay(date, { weekday: "short", day: "numeric", month: "short" })}
                          </label>
                        ))}
                      </div>
                      <Button type="button" size="md" className="mt-3 w-full" disabled={copyTargets.length === 0} onClick={applyCopy}>
                        Apply to {copyTargets.length || ""} date{copyTargets.length === 1 ? "" : "s"}
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {mealTypeTabs(activeDate)}
              {dayMeals(activeDate).length > 0 && <div className="flex flex-col gap-3">{dayMeals(activeDate).map((m) => mealCard(activeDate, m.value))}</div>}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <ConfirmDialog
        open={pendingRemove !== null}
        onOpenChange={(open) => !open && setPendingRemove(null)}
        title={pendingRemove ? `Remove ${removeLabel} on ${formatDay(pendingRemove.date, { day: "numeric", month: "short" })}?` : ""}
        description={`This removes its menu, price${removeCount > 0 ? ` and the ${removeCount} dish${removeCount === 1 ? "" : "es"} picked` : ""}. You can't undo this. It is only saved when you save the order or quotation, so leaving without saving keeps the old meal.${removeKindNote}`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (pendingRemove) removeMeal(pendingRemove.date, pendingRemove.mealType);
          setPendingRemove(null);
        }}
      />
      <ConfirmDialog
        open={pendingAdd !== null}
        onOpenChange={(open) => !open && setPendingAdd(null)}
        title="This will be a Multi Order"
        description={`Adding ${addLabel} gives the order more than one meal type, so it becomes a Multi Order. The order type is updated when you save. Add it?`}
        confirmLabel="Add meal"
        onConfirm={() => {
          if (pendingAdd) addMeal(pendingAdd.date, pendingAdd.mealType);
          setPendingAdd(null);
        }}
      />
      {!sectioned && preferenceControl}

      {sectioned ? (
        <>
          {preferenceControl && (
            <PlanSection step={1} icon={UtensilsCrossed} title="Menu Preference" description="Select the type of menu for this event.">
              {preferenceControl}
            </PlanSection>
          )}
          <PlanSection step={preferenceControl ? 2 : 1} icon={CalendarDays} title="Event Dates & Meals" description={readOnly ? "The meals planned for each event date." : `Add or configure meals for each event date. You can copy meals to other dates to save time.${keepOneMeal ? " At least one meal is required." : ""}`}>
            {datesAndMeals}
          </PlanSection>
        </>
      ) : (
        datesAndMeals
      )}

      {!readOnly && foodDialogTarget && foodDialogEntry && foodDialogMenu && (
        <FoodItemSelectionDrawer
          open
          onOpenChange={(open) => !open && onCloseFoodDialog()}
          menuId={foodDialogMenu.id}
          menuName={foodDialogMenu.name}
          guests={guestsForPricing}
          menuPreference={menuPreference}
          initialItems={foodDialogEntry.items}
          onSave={(items) => setMealItems(foodDialogTarget.date, foodDialogTarget.mealType, items)}
          loadPickerData={loadPickerData}
          hidePrices={hidePrices}
        />
      )}
    </div>
  );
}

/** "2 Dishes", "1 Extra", "2 Add-ons": what a meal holds, without listing every item. Nothing is shown for a count of zero. */
function ItemCountPills({ items }: { items: { itemType: string; perGuest?: boolean }[] }) {
  const addOns = items.filter((item) => item.itemType === "ADD_ON").length;
  const extras = items.filter((item) => item.itemType !== "ADD_ON" && item.perGuest).length;
  const dishes = items.length - addOns - extras;
  const pill = (count: number, singular: string, plural: string, icon: LucideIcon, tone?: string) =>
    count > 0 ? (
      <span className={cn("inline-flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm font-medium", tone)}>
        {createElement(icon, { className: "size-4" })}
        {count} {count === 1 ? singular : plural}
      </span>
    ) : null;
  return (
    <>
      {pill(dishes, "Dish", "Dishes", Utensils)}
      {pill(extras, "Extra", "Extras", UtensilsCrossed, "bg-warning/10 text-warning")}
      {pill(addOns, "Add-on", "Add-ons", CirclePlus, "bg-primary/10 text-primary")}
    </>
  );
}

const CATEGORY_ICONS: [RegExp, LucideIcon][] = [
  [/starter|appetis|snack|chaat|tikka|kebab/i, Leaf],
  [/soup/i, Soup],
  [/salad/i, Salad],
  [/bread|roti|naan|paratha|kulcha/i, Wheat],
  [/dessert|sweet|ice ?cream|cake/i, Cake],
  [/beverage|drink|juice|shake|tea|coffee/i, CupSoda],
  [/main|curry|gravy|rice|biryani|dal/i, ConciergeBell],
];
/** A category has no icon of its own, so one is picked from its name (Main Course, Starter, Dessert...); anything else gets the plain cutlery. */
function categoryIcon(name: string): LucideIcon {
  if (name === "Add-ons") return CirclePlus;
  return CATEGORY_ICONS.find(([pattern]) => pattern.test(name))?.[1] ?? Utensils;
}

/** Beyond this many dishes the list starts collapsed and gets a search box; beyond this many categories it scrolls inside the card. */
const DISHES_OPEN_LIMIT = 12;
const CATEGORIES_SCROLL_LIMIT = 6;

/**
 * The dishes of one meal under the Menu's categories (add-ons last, anything the Menu no longer lists under "Other Items"), built to
 * hold 20 categories of 10 dishes (AJ, 2026-10-19). Each category is one collapsible row (name, dish count, Extra count) with its dishes
 * as compact chips inside, so a closed category costs a single line. Every row starts collapsed with its dishes summarised on the row; a big meal adds a search box, Expand all / Collapse all, and a bounded scroll area so the card never grows endlessly. A search
 * filters the dishes and opens the categories that match. Categories come from the Menu's picker data, loaded once per Menu.
 */
function MealDishes({ items, menuId, loadPickerData }: { items: PickedItem[]; menuId: string; loadPickerData: (menuId: string) => Promise<MenuPickerData | null> }) {
  const [data, setData] = useState<{ menuId: string; picker: MenuPickerData | null } | null>(null);
  const [query, setQuery] = useState("");
  // Categories the person toggled by hand; anything not toggled follows the default for the size of the meal.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let live = true;
    if (menuId) loadPickerData(menuId).then((picker) => live && setData({ menuId, picker }), () => live && setData({ menuId, picker: null }));
    return () => {
      live = false;
    };
  }, [menuId, loadPickerData]);

  const groups = useMemo(() => {
    const picker = data?.menuId === menuId ? data.picker : null;
    const categoryOf = new Map<string, string>();
    const order: string[] = [];
    for (const section of picker?.sections ?? []) {
      order.push(section.categoryName);
      for (const item of section.items) if (!categoryOf.has(item.id)) categoryOf.set(item.id, section.categoryName);
    }
    const byGroup = new Map<string, PickedItem[]>();
    for (const item of items) {
      const group = item.itemType === "ADD_ON" ? "Add-ons" : (categoryOf.get(item.catalogId) ?? "Other Items");
      byGroup.set(group, [...(byGroup.get(group) ?? []), item]);
    }
    const rank = (name: string) => (name === "Add-ons" ? order.length + 1 : name === "Other Items" ? order.length : order.indexOf(name));
    return [...byGroup.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
  }, [data, items, menuId]);

  const big = items.length > DISHES_OPEN_LIMIT;
  const needle = query.trim().toLowerCase();
  const visible = groups
    .map(([name, groupItems]) => [name, needle ? groupItems.filter((item) => item.name.toLowerCase().includes(needle)) : groupItems] as const)
    .filter(([, groupItems]) => groupItems.length > 0);
  const isOpen = (name: string) => (needle ? true : (toggled[name] ?? false));
  const allOpen = visible.every(([name]) => isOpen(name));
  const setAll = (open: boolean) => setToggled(Object.fromEntries(groups.map(([name]) => [name, open])));

  return (
    <div className="flex flex-col gap-2" data-testid="meal-dishes">
      {big && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${items.length} items`}
            aria-label="Search the selected food items"
            className="h-9 min-w-0 flex-1 basis-48"
          />
          {!needle && (
            <Button type="button" variant="outline" size="sm" onClick={() => setAll(!allOpen)}>
              {allOpen ? "Collapse all" : "Expand all"}
            </Button>
          )}
        </div>
      )}
      <div className={cn("flex flex-col divide-y divide-border rounded-xl border border-border bg-background", groups.length > CATEGORIES_SCROLL_LIMIT && "max-h-96 overflow-y-auto")}>
        {visible.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No selected item matches “{query}”.</p>}
        {visible.map(([name, groupItems]) => {
          const open = isOpen(name);
          const extras = groupItems.filter((item) => item.itemType !== "ADD_ON" && item.perGuest).length;
          const Icon = categoryIcon(name);
          return (
            <section key={name} data-testid="meal-dish-group">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => setToggled((prev) => ({ ...prev, [name]: !open }))}
                className="flex min-h-14 w-full items-center gap-3 px-3 text-left text-sm outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                <Icon className="size-5 shrink-0 text-primary" />
                <span className="w-28 shrink-0 truncate font-semibold sm:w-36">{name}</span>
                <span className="hidden h-6 w-px shrink-0 bg-border sm:block" />
                <span className="hidden shrink-0 text-muted-foreground sm:inline">{groupItems.length} selected</span>
                <span className="hidden h-6 w-px shrink-0 bg-border sm:block" />
                {/* The dishes themselves, in one line, as in the design; the full list opens under the row. */}
                <span className="min-w-0 flex-1 truncate" title={groupItems.map((item) => item.name).join(", ")}>
                  {groupItems.map((item) => item.name).join(", ")}
                </span>
                {extras > 0 && <Badge variant="warning" className="shrink-0">{extras} Extra</Badge>}
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-muted px-2 text-sm font-medium">{groupItems.length}</span>
              </button>
              {open && (
                <ul className="flex flex-wrap gap-1.5 px-3 pb-3 pl-14">
                  {groupItems.map((item) => (
                    <li key={item.key} data-testid="meal-dish" className="max-w-full rounded-md border border-border bg-muted/40 px-2 py-1 text-sm break-words">
                      {item.name}
                      {item.itemType === "ADD_ON" ? <span className="ml-1.5 text-xs text-primary">Add-on</span> : item.perGuest ? <span className="ml-1.5 text-xs text-warning">Extra</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
