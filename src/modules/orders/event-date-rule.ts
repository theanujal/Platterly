/**
 * "No backdated orders" (AJ, 2026-09-27) for the kitchen team's own forms
 * (Create / edit Order, the linked Event). They may book today and tomorrow;
 * only a date that has already gone is refused. Customers ordering through the
 * public storefront are held to 2 days' notice instead — see
 * menu-approvals/public-lead-time.ts. Pure, so it is unit-testable.
 *
 * Days are compared by local calendar day (midnight to midnight). `unchangedFrom`
 * is the date the record already has: an existing order or event keeps its own
 * (possibly past) date, so only a date being newly chosen is refused.
 */
export function daysFromToday(date: Date, now: Date = new Date()): number {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((startOfDate.getTime() - startOfToday.getTime()) / 86_400_000);
}

export function isBackdated(date: Date, unchangedFrom?: Date, now: Date = new Date()): boolean {
  if (daysFromToday(date, now) >= 0) return false;
  if (unchangedFrom && daysFromToday(date, now) === daysFromToday(unchangedFrom, now)) return false;
  return true;
}
