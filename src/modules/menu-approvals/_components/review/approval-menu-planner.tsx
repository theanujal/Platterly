"use client";

import { useMemo } from "react";
import { MenuPlanningSection, type MealSelection, type MenuOption } from "@/components/catalog/menu-planning-section";
import { compareMealPlans, snapshotToMealSelections } from "@/modules/menu-approvals/snapshot-meals";
import type { FoodDialogTarget, ReviewActions, VersionView } from "./types";

/**
 * The menu planner (two numbered cards: Menu Preference, Event Dates & Meals): the live planner (editable while the menu is still with the team) or, for a frozen version, the same
 * planner read-only with an optional Compare against the current menu.
 */
export function ApprovalMenuPlanner({
  shownVersion,
  compareOn,
  versionHasDishIds,
  editable,
  canAct = true,
  isCustomMenu,
  individualPricingEnabled,
  totalGuests,
  days,
  eventDays,
  entries,
  currentEntries,
  menus,
  menuPreference,
  foodDialogTarget,
  loadPickerData,
  onEntriesChange,
  onMenuPreferenceChange,
  onFoodDialogChange,
}: {
  shownVersion: VersionView | null;
  compareOn: boolean;
  versionHasDishIds: boolean;
  editable: boolean;
  /** The viewer may edit the planner (they can act on the approval). Without it the planner is shown read-only. */
  canAct?: boolean;
  isCustomMenu: boolean;
  individualPricingEnabled: boolean;
  totalGuests: number;
  days: string[];
  /** The order's own event dates; a planned day outside them is flagged. */
  eventDays: string[];
  /** The planner draft being edited. */
  entries: MealSelection[];
  /** The saved meals the order has now: what a version is compared against. */
  currentEntries: MealSelection[];
  menus: MenuOption[];
  menuPreference: string;
  foodDialogTarget: FoodDialogTarget;
  loadPickerData: ReviewActions["loadPickerData"];
  onEntriesChange: (next: MealSelection[]) => void;
  onMenuPreferenceChange: (value: string) => void;
  onFoodDialogChange: (target: FoodDialogTarget) => void;
}) {
  const versionEntries = useMemo(() => (shownVersion?.snapshot ? snapshotToMealSelections(shownVersion.snapshot) : []), [shownVersion]);
  const versionDays = useMemo(() => [...new Set(versionEntries.map((e) => e.date))].sort(), [versionEntries]);
  const versionMenus = useMemo(() => {
    const known = new Set(menus.map((m) => m.id));
    const extra: MenuOption[] = (shownVersion?.snapshot?.meals ?? [])
      .filter((m) => m.menuId && !known.has(m.menuId))
      .map((m) => ({
        id: m.menuId as string,
        name: m.menuName ?? "Menu",
        menuType: "VEGETARIAN",
        price: 0,
        childUnder5Chargeable: false,
        childUnder5Price: null,
        child5To10PricingType: "FIXED",
        child5To10PriceValue: null,
      }));
    return [...menus, ...extra];
  }, [menus, shownVersion]);
  const compareMarks = useMemo(
    () =>
      shownVersion && compareOn && versionHasDishIds
        ? compareMealPlans(versionEntries, currentEntries, { highlight: "Not in current", missing: "Added since" })
        : undefined,
    [shownVersion, compareOn, versionHasDishIds, versionEntries, currentEntries],
  );
  // A Custom Menu's dishes come from the open dish list, which the planner's per-menu picker can't edit, so it is shown as is.
  const planReadOnly = !editable || isCustomMenu || !canAct;

  const intro = shownVersion
    ? `Version ${shownVersion.versionNumber} as it was sent to the customer.`
    : editable
      ? isCustomMenu
        ? "The customer's own dishes. Edit the price above."
        : null
      : "The menu on this order. It is locked while it is with the customer or the kitchen.";

  return (
    <div className="flex flex-col gap-4">
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}
      {shownVersion ? (
        shownVersion.snapshot && shownVersion.snapshot.meals.length > 0 ? (
          <MenuPlanningSection
            idPrefix="approval-version"
            days={versionDays}
            mealPlanEntries={versionEntries}
            onChange={() => {}}
            menus={versionMenus}
            menuPreference=""
            onMenuPreferenceChange={() => {}}
            individualPricingEnabled={individualPricingEnabled}
            guestsForPricing={totalGuests}
            loadPickerData={loadPickerData}
            foodDialogTarget={null}
            onOpenFoodDialog={() => {}}
            onCloseFoodDialog={() => {}}
            readOnly
            compare={compareMarks}
            sectioned
            outsideDays={versionDays.filter((d) => !eventDays.includes(d))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">This version has no per-meal details saved.</p>
        )
      ) : (
        <MenuPlanningSection
          idPrefix="approval"
          days={days}
          mealPlanEntries={entries}
          onChange={onEntriesChange}
          menus={menus}
          menuPreference={menuPreference}
          onMenuPreferenceChange={onMenuPreferenceChange}
          individualPricingEnabled={individualPricingEnabled}
          guestsForPricing={totalGuests}
          loadPickerData={loadPickerData}
          foodDialogTarget={foodDialogTarget}
          onOpenFoodDialog={(date, mealType) => onFoodDialogChange({ date, mealType })}
          onCloseFoodDialog={() => onFoodDialogChange(null)}
          readOnly={planReadOnly}
          sectioned
          outsideDays={days.filter((d) => !eventDays.includes(d))}
        />
      )}
    </div>
  );
}
