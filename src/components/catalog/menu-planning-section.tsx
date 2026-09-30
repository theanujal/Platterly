"use client";

import { createElement, useMemo, useState } from "react";
import { Check, ChevronDown, Coffee, Copy, Moon, PenSquare, Plus, Sun, Sunrise, Trash2, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
}: MenuPlanningSectionProps) {
  const [focusedDate, setFocusedDate] = useState<string | null>(days[0] ?? null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);

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
    onChange([...mealPlanEntries, { date, mealType, price: "", menuId: "", items: [] }]);
    setFocusedDate(date);
  }

  function removeMeal(date: string, mealType: MealTypeValue) {
    onChange(mealPlanEntries.filter((e) => !(e.date === date && e.mealType === mealType)));
  }

  function setMealMenu(date: string, mealType: MealTypeValue, menuId: string) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, menuId, items: [] } : e)));
  }

  function setMealPrice(date: string, mealType: MealTypeValue, price: string) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, price } : e)));
  }

  function setMealItems(date: string, mealType: MealTypeValue, items: PickedItem[]) {
    onChange(mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, items } : e)));
  }

  /** Chip-list "x" — removes by row key rather than re-deriving the catalog option. */
  function removeMealItem(date: string, mealType: MealTypeValue, itemKey: string) {
    onChange(
      mealPlanEntries.map((e) => (e.date === date && e.mealType === mealType ? { ...e, items: e.items.filter((i) => i.key !== itemKey) } : e)),
    );
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
        className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-accent/40 p-3 sm:p-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {createElement(MEAL_ICON[mealType], { className: "size-4" })}
            </span>
            {meal.label}
          </span>
          <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => removeMeal(date, mealType)}>
            <Trash2 className="size-3.5" />
            Remove {meal.label}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-meal-menu-${date}-${mealType}`} required className="text-xs">
              Menu
            </Label>
            <Select items={Object.fromEntries(menus.map((m) => [m.id, m.name]))} value={entry.menuId} onValueChange={(v) => setMealMenu(date, mealType, v ?? "")}>
              <SelectTrigger id={`${idPrefix}-meal-menu-${date}-${mealType}`} className="w-full">
                <SelectValue placeholder="Select Menu" />
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${idPrefix}-meal-price-${date}-${mealType}`} className="text-xs">
              Price
            </Label>
            {individualPricingEnabled ? (
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
              <div className="flex h-10 items-center justify-between rounded-lg border border-input bg-muted/40 px-3 text-sm">
                <span>{assignedMenu ? formatCurrency(assignedMenu.price) : "—"}</span>
                <span className="text-xs text-muted-foreground">/ plate</span>
              </div>
            )}
          </div>
        </div>

        {entry.menuId && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <span className="font-medium">Food Items</span>
                <span className="ml-2 text-muted-foreground">
                  {entry.items.length === 0 ? "No items selected" : `${entry.items.length} item${entry.items.length === 1 ? "" : "s"} selected`}
                </span>
              </span>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenFoodDialog(date, mealType)}>
                {entry.items.length === 0 ? <Plus className="size-3.5" /> : <PenSquare className="size-3.5" />}
                {entry.items.length === 0 ? "Select Food Items" : "Edit Items"}
              </Button>
            </div>
            {entry.items.length > 0 && (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {entry.items.map((item) => (
                    <Badge key={item.key} variant="outline" className="gap-1 pr-1">
                      {item.name}
                      {item.itemType === "ADD_ON" ? <span className="text-primary">Add-on</span> : item.perGuest ? <span className="text-warning">Extra</span> : null}
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() => removeMealItem(date, mealType, item.key)}
                        className="rounded-full p-0.5 hover:bg-muted"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
                <div className="flex items-start gap-2 rounded-lg bg-success/10 p-3 text-xs text-success">
                  <Check className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {entry.items.length} food item{entry.items.length === 1 ? "" : "s"} selected for {meal.label}.
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function mealTypeTabs(date: string) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {MEAL_TYPES.map((meal) => {
          const selected = mealMap.has(`${date}|${meal.value}`);
          return (
            <button
              key={meal.value}
              type="button"
              onClick={() => toggleMeal(date, meal.value)}
              className={cn(
                "flex items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors",
                selected ? "border-primary bg-accent/40" : "border-input hover:bg-muted/40",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                {createElement(MEAL_ICON[meal.value], { className: "size-4 text-muted-foreground" })}
                {meal.label}
              </span>
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full border",
                  selected ? "border-success bg-success text-white" : "border-input",
                )}
              >
                {selected && <Check className="size-3.5" />}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  const foodDialogEntry = foodDialogTarget ? mealMap.get(`${foodDialogTarget.date}|${foodDialogTarget.mealType}`) : undefined;
  const foodDialogMenu = foodDialogEntry ? menus.find((m) => m.id === foodDialogEntry.menuId) : undefined;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5" role="group" aria-label="Menu Preference">
        <Label>Menu Preference</Label>
        <div className="flex flex-wrap gap-3">
          {(
            [
              { value: "VEGETARIAN", label: "Vegetarian", hint: "Vegetarian menus and dishes only", dot: "bg-success" },
              { value: "NON_VEGETARIAN", label: "Non-Vegetarian", hint: "Every menu and dish", dot: "bg-destructive" },
            ] as const
          ).map((option) => {
            const selected = menuPreference === option.value;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onMenuPreferenceChange(selected ? "" : option.value)}
                className={cn(
                  "flex min-w-44 flex-1 items-center gap-3 rounded-lg border p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selected ? "border-primary bg-accent/40" : "border-input hover:bg-muted/40",
                )}
              >
                <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border", selected ? "border-primary" : "border-input")}>
                  {selected && <span className="size-2.5 rounded-full bg-primary" />}
                </span>
                <span className="flex flex-col">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <span className={cn("size-2 rounded-full", option.dot)} />
                    {option.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">Set the Event Date above to start planning meals.</p>
      ) : days.length === 1 ? (
        <div className="flex flex-col gap-3">
          {mealTypeTabs(days[0])}
          {dayMeals(days[0]).length > 0 && <div className="flex flex-col gap-3">{dayMeals(days[0]).map((m) => mealCard(days[0], m.value))}</div>}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
          <nav className="flex flex-row gap-1.5 overflow-x-auto rounded-xl border border-border p-2 md:flex-col md:overflow-x-visible" aria-label="Event Dates">
            <span className="hidden px-2 pt-1 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase md:block">Event Dates</span>
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
                    <span className={cn("text-sm font-medium", isFocused && "text-primary")}>{formatDay(date, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
                  </span>
                  <span className="pl-4 text-xs text-muted-foreground">{meals.length > 0 ? meals.map((m) => m.label).join(", ") : "No meals selected"}</span>
                </button>
              );
            })}
          </nav>

          {activeDate && (
            <div className="flex min-w-0 flex-col gap-4 rounded-xl border border-border p-3 sm:p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold">{formatDay(activeDate, { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</h3>
                  <p className="text-sm text-muted-foreground">Select and configure meals for this date.</p>
                </div>
                {otherDays.length > 0 && (
                  <Popover open={copyOpen} onOpenChange={(open) => { setCopyOpen(open); if (!open) setCopyTargets([]); }}>
                    <PopoverTrigger
                      type="button"
                      disabled={!activeDateHasMeals}
                      className="flex h-9 items-center gap-2 rounded-lg border border-input bg-transparent px-3 text-sm outline-none transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-50"
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

      {foodDialogTarget && foodDialogEntry && foodDialogMenu && (
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
        />
      )}
    </div>
  );
}
