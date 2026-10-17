/**
 * An order's events: each meal slot (a day and a meal) is one event, listed in order as "Day 1 · Dinner", "Day 2 · Lunch" (just "Dinner" when
 * every event is on one day). Pure and client-safe, so the venue editor, the logistics card and the server all read the events the same way.
 */
export const MEAL_LABEL: Record<string, string> = { BREAKFAST: "Breakfast", LUNCH: "Lunch", HITEA: "Hi-Tea", DINNER: "Dinner", OTHER: "Other" };

export interface EventSlotInfo {
  /** "YYYY-MM-DD-MEALTYPE", the key the venues and logistics rows use. */
  key: string;
  /** "YYYY-MM-DD" */
  date: string;
  mealType: string;
  title: string;
}

export const slotKeyOf = (date: string, mealType: string) => `${date.slice(0, 10)}-${mealType}`;

export function buildEventSlots(meals: readonly { date: string; mealType: string }[]): EventSlotInfo[] {
  const unique = [...new Map(meals.map((meal) => [slotKeyOf(meal.date, meal.mealType), meal])).entries()].sort(([a], [b]) => a.localeCompare(b));
  const dates = [...new Set(unique.map(([, meal]) => meal.date.slice(0, 10)))];
  return unique.map(([key, meal]) => {
    const date = meal.date.slice(0, 10);
    const label = MEAL_LABEL[meal.mealType] ?? meal.mealType;
    return { key, date, mealType: meal.mealType, title: dates.length > 1 ? `Day ${dates.indexOf(date) + 1} · ${label}` : label };
  });
}
