import type { MenuPickerData } from "@/modules/menus/menu";
import type { MenuOption } from "@/components/catalog/menu-planning-section";

/**
 * Server-side redaction for the Roles & Permissions redesign (AJ, 2026-10-17). A person without a sensitive key gets the record
 * built without its protected fields, so the value never reaches the browser, a PDF, an export or a nested object. The
 * calculations the application needs (a total, a balance) keep using the real numbers on the server; only what is handed to
 * this person changes. Each helper takes the yes/no the caller already read from `sensitiveAccess()`.
 */

type MenuRow = {
  id: string;
  name: string;
  menuType: "VEGETARIAN" | "NON_VEGETARIAN";
  pricePerPlate: unknown;
  childUnder5Chargeable: boolean;
  childUnder5Price: unknown;
  child5To10PricingType: "PERCENTAGE" | "FIXED";
  child5To10PriceValue: unknown;
};

const num = (value: unknown) => Number(value);
const numOrNull = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** The menu choices an order or quotation form offers. Without the price right, every figure is 0 or null: the names and rules stay. */
export function menuOptionsFor(menus: MenuRow[], showPrices: boolean): MenuOption[] {
  return menus.map((m) => ({
    id: m.id,
    name: m.name,
    menuType: m.menuType,
    price: showPrices ? num(m.pricePerPlate) : 0,
    childUnder5Chargeable: m.childUnder5Chargeable,
    childUnder5Price: showPrices ? numOrNull(m.childUnder5Price) : null,
    child5To10PricingType: m.child5To10PricingType,
    child5To10PriceValue: showPrices ? numOrNull(m.child5To10PriceValue) : null,
  }));
}

/** The food-item drawer's data without dish and add-on prices (an order or quotation picker for a person without that price right). */
export function pickerWithoutPrices(data: MenuPickerData): MenuPickerData {
  return {
    ...data,
    sections: data.sections.map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, price: 0 })) })),
    addOns: data.addOns.map((addOn) => ({ ...addOn, price: 0 })),
  };
}
