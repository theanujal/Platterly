/**
 * Meals follow the event date (AJ, 2026-10-16): when an order's dates change, every meal moves by the same number of days as the start date, and
 * one that would still fall outside the new dates is put on the nearest event day. Two meals of the same type landing on one day become one (the
 * one with a menu or dishes wins). Pure on ISO days ("2026-11-06"), so the order form and the server share it.
 */
const DAY_MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function moveMealsWithEventDates<T extends { date: string; mealType: string }>(
  meals: readonly T[],
  oldStart: string,
  newStart: string,
  newEnd: string,
  hasContent: (meal: T) => boolean = () => false,
): { moved: (T & { fromDate: string })[]; dropped: T[] } {
  const shiftDays = Math.round((toMs(newStart) - toMs(oldStart)) / DAY_MS);
  const placed = new Map<string, T & { fromDate: string }>();
  const dropped: T[] = [];
  for (const meal of meals) {
    const shifted = toIso(toMs(meal.date) + shiftDays * DAY_MS);
    const date = shifted < newStart ? newStart : shifted > newEnd ? newEnd : shifted;
    const key = `${date}|${meal.mealType}`;
    const entry = { ...meal, date, fromDate: meal.date };
    const existing = placed.get(key);
    if (!existing) placed.set(key, entry);
    else if (!hasContent(existing) && hasContent(meal)) {
      dropped.push(existing);
      placed.set(key, entry);
    } else dropped.push(meal);
  }
  return { moved: [...placed.values()], dropped };
}
