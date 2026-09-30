import type { ApprovalSnapshot } from "./approval-snapshot";
import type { ComparisonMarks, MealSelection } from "@/components/catalog/menu-planning-section";

// Client-safe and pure. Turns a frozen version back into the planner's shape so the Menu Approvals page
// can show an older version in the very same Menu Planning UI, and compares two plans dish by dish.

/** True when every dish in the snapshot carries its catalog id — versions sent before 2026-09-30 only kept names. */
export function snapshotHasDishIds(snapshot: ApprovalSnapshot): boolean {
  return snapshot.meals.every((meal) => meal.items.every((item) => Boolean(item.catalogId)));
}

export function snapshotToMealSelections(snapshot: ApprovalSnapshot): MealSelection[] {
  return snapshot.meals.map((meal) => ({
    date: meal.date,
    mealType: meal.mealType,
    price: meal.price === null || meal.price === undefined ? "" : String(meal.price),
    menuId: meal.menuId ?? "",
    items: meal.items.map((item, index) => {
      const isAddOn = item.itemType === "ADD_ON";
      return {
        key: `${meal.date}|${meal.mealType}|${index}`,
        itemType: isAddOn ? ("ADD_ON" as const) : ("MENU_ITEM" as const),
        catalogId: item.catalogId ?? item.name,
        name: item.name,
        unitPrice: item.unitPrice ?? 0,
        perGuest: isAddOn ? item.quantity > 1 : item.isExtra === true,
      };
    }),
  }));
}

/**
 * Marks for the version view's Compare toggle, from the point of view of `shown` (an older version) against `other`
 * (the current menu): a dish `shown` has that `other` lacks is highlighted, and a dish `other` has that `shown` lacks is listed as missing.
 */
export function compareMealPlans(shown: MealSelection[], other: MealSelection[], labels: { highlight: string; missing: string }): ComparisonMarks {
  const keysOf = (entries: MealSelection[]) => new Set(entries.flatMap((e) => e.items.map((i) => `${e.date}|${e.mealType}|${i.catalogId}`)));
  const shownKeys = keysOf(shown);
  const otherKeys = keysOf(other);

  const highlight = new Set([...shownKeys].filter((key) => !otherKeys.has(key)));
  const missing: ComparisonMarks["missing"] = {};
  for (const entry of other) {
    const slot = `${entry.date}|${entry.mealType}`;
    const gone = entry.items.filter((item) => !shownKeys.has(`${slot}|${item.catalogId}`)).map((item) => ({ name: item.name, catalogId: item.catalogId }));
    if (gone.length > 0) missing[slot] = gone;
  }
  return { highlight, highlightLabel: labels.highlight, missing, missingLabel: labels.missing };
}
