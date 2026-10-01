import { MEAL_TYPE_LABEL, type ApprovalSnapshot } from "./approval-snapshot";

// Client-safe and pure: turns one frozen ApprovalSnapshot into what the customer's approval page draws (Event Details,
// Proposed Menu, Selected Dishes by category, Add-ons & Live Counters, Price Summary). A snapshot sent before the
// redesign has no categories, add-on types or price breakdown; those still render, in a simpler form.

export interface ApprovalDishGroup {
  category: string;
  items: { name: string; isExtra: boolean }[];
}

export interface ApprovalMealView {
  key: string;
  label: string;
  date: string;
  menuName: string | null;
  groups: ApprovalDishGroup[];
}

export interface ApprovalAddOnView {
  key: string;
  name: string;
  kind: "LIVE_COUNTER" | "EXTRA_ITEM" | "ADD_ON";
  /** "₹2,000.00 flat", "₹70.00 / plate", "Included in package" */
  priceLabel: string;
}

export interface ApprovalPriceRow {
  label: string;
  detail?: string;
  amount: number;
}

export interface ApprovalView {
  eventType: string | null;
  dateText: string;
  guests: number | null;
  location: string | null;
  menu: { name: string; description: string | null; image: string | null; pricePerPlate: number | null; extraMenus: string[] } | null;
  isCustomMenu: boolean;
  meals: ApprovalMealView[];
  addOns: ApprovalAddOnView[];
  /** Empty for a snapshot that predates the Price Summary: the page then shows only the total. */
  priceRows: ApprovalPriceRow[];
  total: number;
  /** Dishes picked outside any meal (older storefront orders), shown as one list. */
  looseItems: { name: string; isExtra: boolean }[];
}

const OTHER = "Other dishes";

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Dates in the snapshot are UTC-midnight ISO days: format them in UTC so they never shift a day.
export function formatApprovalDay(iso: string): string {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function buildApprovalView(snapshot: ApprovalSnapshot): ApprovalView {
  const sameDay = snapshot.eventStartDate === snapshot.eventEndDate;
  const dateText = sameDay ? formatApprovalDay(snapshot.eventStartDate) : `${formatApprovalDay(snapshot.eventStartDate)} – ${formatApprovalDay(snapshot.eventEndDate)}`;

  const meals: ApprovalMealView[] = snapshot.meals.map((meal) => {
    const groups = new Map<string, ApprovalDishGroup>();
    for (const item of meal.items) {
      if (item.itemType === "ADD_ON") continue;
      const category = item.category?.trim() || OTHER;
      const group = groups.get(category) ?? { category, items: [] };
      group.items.push({ name: item.name, isExtra: item.isExtra === true });
      groups.set(category, group);
    }
    return {
      key: `${meal.date}-${meal.mealType}`,
      label: MEAL_TYPE_LABEL[meal.mealType],
      date: meal.date,
      menuName: meal.menuName,
      groups: [...groups.values()],
    };
  });

  // Add-ons are shown once, even when several meals each carry them; the Price Summary already multiplies them.
  const addOnMap = new Map<string, ApprovalAddOnView>();
  for (const meal of snapshot.meals) {
    for (const item of meal.items) {
      if (item.itemType !== "ADD_ON") continue;
      const key = item.catalogId ?? item.name;
      if (addOnMap.has(key)) continue;
      const price = item.unitPrice ?? 0;
      const perPlate = item.priceType === "PER_PLATE";
      addOnMap.set(key, {
        key,
        name: item.name,
        kind: item.addOnType === "LIVE_COUNTER" ? "LIVE_COUNTER" : "ADD_ON",
        priceLabel: item.included || price === 0 ? "Included in package" : `${formatInr(price)} ${perPlate ? "/ plate" : "flat"}`,
      });
    }
  }
  // Extra dishes are the "Extra Items" the customer chose beyond the menu's limits.
  for (const meal of snapshot.meals) {
    for (const item of meal.items) {
      if (item.itemType === "ADD_ON" || !item.isExtra) continue;
      const key = `extra-${item.catalogId ?? item.name}`;
      if (addOnMap.has(key)) continue;
      addOnMap.set(key, { key, name: item.name, kind: "EXTRA_ITEM", priceLabel: `${formatInr(item.unitPrice ?? 0)} / plate` });
    }
  }

  const first = snapshot.meals.find((meal) => meal.menuName);
  const otherMenus = [...new Set(snapshot.meals.map((meal) => meal.menuName).filter((name): name is string => !!name && name !== first?.menuName))];
  const menu = first
    ? {
        name: first.menuName!,
        description: first.menuDescription ?? null,
        image: first.menuImage ?? null,
        pricePerPlate: first.pricePerPlate ?? null,
        extraMenus: otherMenus,
      }
    : null;

  const priceRows: ApprovalPriceRow[] = [];
  const breakdown = snapshot.breakdown;
  if (breakdown) {
    if (!snapshot.isCustomMenu) {
      const adults = Math.max((snapshot.guests ?? 0) - (snapshot.childBelow5Count ?? 0) - (snapshot.child5To10Count ?? 0), 0);
      const mealCount = Math.max(snapshot.meals.length, 1);
      const rate = menu?.pricePerPlate ?? null;
      // Only spell the multiplication out when it adds up, e.g. not under Individual Pricing.
      const detail = rate !== null && adults > 0 && Math.abs(rate * adults * mealCount - breakdown.menuAmount) < 0.01 ? `${formatInr(rate)} × ${adults} guests${mealCount > 1 ? ` × ${mealCount} meals` : ""}` : undefined;
      priceRows.push({ label: menu ? menu.name : "Menu", detail, amount: breakdown.menuAmount });
    }
    if (breakdown.extrasAmount > 0) priceRows.push({ label: "Extra Items", amount: breakdown.extrasAmount });
    if (breakdown.liveCountersAmount > 0) priceRows.push({ label: "Live Counters", amount: breakdown.liveCountersAmount });
    if (breakdown.addOnsAmount > 0) priceRows.push({ label: "Add-ons", amount: breakdown.addOnsAmount });
    if (breakdown.childrenCharge > 0) priceRows.push({ label: "Kids charges", amount: breakdown.childrenCharge });
    if (Math.abs(breakdown.adjustments) >= 0.01) priceRows.push({ label: "Discount & other charges", amount: breakdown.adjustments });
  }

  return {
    eventType: snapshot.eventTypeName,
    dateText,
    guests: snapshot.guests,
    location: snapshot.venue,
    menu,
    isCustomMenu: snapshot.isCustomMenu,
    meals,
    addOns: [...addOnMap.values()],
    priceRows,
    total: snapshot.total,
    looseItems: snapshot.selectedItems,
  };
}
