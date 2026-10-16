import type { ApprovalSnapshot } from "./approval-snapshot";
import { MEAL_TYPE_LABEL } from "./approval-snapshot";

// Client-safe. Compares what the customer was sent (a frozen snapshot) with what the order says now, in words for the team.

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const dayText = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

type Item = ApprovalSnapshot["meals"][number]["items"][number];
const itemKey = (item: Item) => `${item.name}|${item.quantity}|${item.unitPrice ?? 0}|${item.isExtra ? 1 : 0}`;

/** The most reasons shown at once; the rest are counted. */
const MAX_REASONS = 6;

/**
 * What differs between the menu the customer was sent and the order now: the price, the guests (adults and children), the event
 * dates, and every meal's menu, price and dishes. An empty list means the customer's page still shows the order as it is.
 * Fields an older snapshot never stored (adults, children) are left out of the comparison rather than reported as changes.
 */
export function snapshotChanges(sent: ApprovalSnapshot, live: ApprovalSnapshot): string[] {
  const reasons: string[] = [];

  if (Math.abs(sent.total - live.total) >= 0.005) reasons.push(`The price changed (${rupees(sent.total)} to ${rupees(live.total)})`);
  if (sent.adultCount !== undefined && live.adultCount !== undefined) {
    if (sent.adultCount !== live.adultCount) reasons.push(`Adults changed (${sent.adultCount} to ${live.adultCount})`);
  } else if ((sent.guests ?? 0) !== (live.guests ?? 0)) {
    reasons.push(`Guests changed (${sent.guests ?? 0} to ${live.guests ?? 0})`);
  }
  if (sent.childBelow5Count !== undefined && sent.childBelow5Count !== live.childBelow5Count) reasons.push(`Children under 5 changed (${sent.childBelow5Count} to ${live.childBelow5Count})`);
  if (sent.child5To10Count !== undefined && sent.child5To10Count !== live.child5To10Count) reasons.push(`Children 5 to 10 changed (${sent.child5To10Count} to ${live.child5To10Count})`);
  if (sent.eventStartDate !== live.eventStartDate || sent.eventEndDate !== live.eventEndDate) reasons.push("The event dates changed");

  const mealKey = (m: ApprovalSnapshot["meals"][number]) => `${m.date}|${m.mealType}`;
  const mealLabel = (m: ApprovalSnapshot["meals"][number]) => `${MEAL_TYPE_LABEL[m.mealType]}, ${dayText(m.date)}`;
  const sentMeals = new Map(sent.meals.map((m) => [mealKey(m), m]));
  const liveMeals = new Map(live.meals.map((m) => [mealKey(m), m]));
  for (const [key, meal] of liveMeals) if (!sentMeals.has(key)) reasons.push(`${mealLabel(meal)} was added`);
  for (const [key, meal] of sentMeals) if (!liveMeals.has(key)) reasons.push(`${mealLabel(meal)} was removed`);
  for (const [key, was] of sentMeals) {
    const now = liveMeals.get(key);
    if (!now) continue;
    if ((was.menuId ?? null) !== (now.menuId ?? null) || (was.menuName ?? null) !== (now.menuName ?? null)) {
      reasons.push(`${mealLabel(now)}: the menu changed (${was.menuName ?? "none"} to ${now.menuName ?? "none"})`);
    } else if ((was.price ?? null) !== (now.price ?? null)) {
      reasons.push(`${mealLabel(now)}: the price per plate changed`);
    }
    const before = new Map<string, Item>(was.items.map((i) => [itemKey(i), i]));
    const after = new Map<string, Item>(now.items.map((i) => [itemKey(i), i]));
    const added = [...after].filter(([k]) => !before.has(k)).map(([, i]) => i.name);
    const removed = [...before].filter(([k]) => !after.has(k)).map(([, i]) => i.name);
    if (added.length > 0 || removed.length > 0) {
      const names = [...new Set([...added, ...removed])];
      reasons.push(`${mealLabel(now)}: dishes or add-ons changed (${names.join(", ")})`);
    }
  }

  if (reasons.length <= MAX_REASONS) return reasons;
  return [...reasons.slice(0, MAX_REASONS), `and ${reasons.length - MAX_REASONS} more`];
}
