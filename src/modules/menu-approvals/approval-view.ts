import type { MealType } from "@/generated/prisma/enums";
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
  mealType: MealType;
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
  /** A discount: shown with a minus sign, not added. */
  negative?: boolean;
}

export interface ApprovalView {
  eventType: string | null;
  dateText: string;
  guests: number | null;
  /** Kids are counted on top of the adults: "50 adults + 32 kids (82 guests)". */
  adults: number | null;
  kids: number;
  childBelow5: number;
  child5To10: number;
  location: string | null;
  menu: { name: string; description: string | null; image: string | null; pricePerPlate: number | null; extraMenus: string[] } | null;
  /** Every menu on the order, once each, with its per-plate price: the Event Overview lists them when there is more than one. */
  menus: { name: string; pricePerPlate: number | null }[];
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
      mealType: meal.mealType,
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

  const kids = (snapshot.childBelow5Count ?? 0) + (snapshot.child5To10Count ?? 0);
  const priceRows: ApprovalPriceRow[] = [];
  const breakdown = snapshot.breakdown;
  if (breakdown) {
    // A Custom Menu has no menu price, unless another meal of the same order is on a fixed menu.
    if (!snapshot.isCustomMenu || breakdown.menuAmount > 0) {
      const adults = Math.max((snapshot.guests ?? 0) - (snapshot.childBelow5Count ?? 0) - (snapshot.child5To10Count ?? 0), 0);
      const mealCount = Math.max(snapshot.meals.length, 1);
      const rate = menu?.pricePerPlate ?? null;
      // Only spell the multiplication out when it adds up, e.g. not under Individual Pricing.
      const detail = rate !== null && adults > 0 && Math.abs(rate * adults * mealCount - breakdown.menuAmount) < 0.01 ? `${formatInr(rate)} × ${adults} adults${mealCount > 1 ? ` × ${mealCount} meals` : ""}` : undefined;
      priceRows.push({ label: menu ? menu.name : "Menu", detail, amount: breakdown.menuAmount });
    }
    if (breakdown.extrasAmount > 0) priceRows.push({ label: "Extra Items", amount: breakdown.extrasAmount });
    if (breakdown.liveCountersAmount > 0) priceRows.push({ label: "Live Counters", amount: breakdown.liveCountersAmount });
    if (breakdown.addOnsAmount > 0) priceRows.push({ label: "Add-ons", amount: breakdown.addOnsAmount });
    if (breakdown.childrenCharge > 0) {
      const bands = [
        (snapshot.childBelow5Count ?? 0) > 0 ? `${snapshot.childBelow5Count} under 5` : null,
        (snapshot.child5To10Count ?? 0) > 0 ? `${snapshot.child5To10Count} aged 5–10` : null,
      ].filter(Boolean);
      priceRows.push({ label: "Children charges", detail: bands.length > 0 ? bands.join(" · ") : undefined, amount: breakdown.childrenCharge });
    }
    if (breakdown.discount === undefined) {
      // A version sent before the charge lines were frozen: one combined line, as before.
      if (Math.abs(breakdown.adjustments) >= 0.01) priceRows.push({ label: "Discount & other charges", amount: breakdown.adjustments });
    } else {
      const transportation = breakdown.transportation ?? 0;
      const otherCharges = breakdown.otherCharges ?? 0;
      const customCharges = breakdown.customCharges ?? [];
      if (transportation > 0) priceRows.push({ label: "Transportation Cost", amount: transportation });
      if (otherCharges > 0) priceRows.push({ label: "Extra / Service Cost", amount: otherCharges });
      for (const charge of customCharges) if (charge.amount > 0) priceRows.push({ label: charge.label, amount: charge.amount });
      if (breakdown.discount > 0) priceRows.push({ label: "Discount", amount: breakdown.discount, negative: true });
      // Whatever the lines above do not explain, so the rows always add up to the Grand Total.
      const explained = transportation + otherCharges + customCharges.reduce((sum, c) => sum + c.amount, 0) - breakdown.discount;
      const rest = breakdown.adjustments - explained;
      if (Math.abs(rest) >= 0.01) priceRows.push({ label: "Other adjustments", amount: rest });
    }
  }

  return {
    eventType: snapshot.eventTypeName,
    dateText,
    guests: snapshot.guests,
    adults: snapshot.guests === null ? null : Math.max(snapshot.guests - kids, 0),
    kids,
    childBelow5: snapshot.childBelow5Count ?? 0,
    child5To10: snapshot.child5To10Count ?? 0,
    location: snapshot.venue,
    menu,
    menus: [...new Map(snapshot.meals.filter((meal) => meal.menuName).map((meal) => [meal.menuName!, { name: meal.menuName!, pricePerPlate: meal.pricePerPlate ?? null }])).values()],
    isCustomMenu: snapshot.isCustomMenu,
    meals,
    addOns: [...addOnMap.values()],
    priceRows,
    total: snapshot.total,
    looseItems: snapshot.selectedItems,
  };
}
