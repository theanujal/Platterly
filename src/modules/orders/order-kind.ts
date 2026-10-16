/**
 * Whether an order is a Single or a Multi Order, worked out from what it holds: more than one event date, or more than one kind of meal
 * (Breakfast, Lunch, ...), makes it Multi. Pure, so the Menu Approval planner's prompt and the server's save use the same rule.
 */
export function orderKindFor(eventDayCount: number, mealTypes: readonly string[]): "SINGLE" | "MULTI" {
  return eventDayCount > 1 || new Set(mealTypes).size > 1 ? "MULTI" : "SINGLE";
}
