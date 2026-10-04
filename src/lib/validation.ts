import { ValidationError } from "./errors";

/**
 * Chunk 17.3 — server-side input checks. The forms already check most of this in the browser, but the browser is not
 * a trust boundary: every Server Action can be called with any values. These checks run inside the modules, so every
 * way in (forms, actions, imports, tests) is covered.
 */
export { ValidationError };

export const MAX_MONEY = 100_000_000; // Rs 10 crore on one line is already far beyond any real catering order
export const MAX_COUNT = 100_000; // guests, items, plates
export const MAX_QUANTITY = 1_000_000_000;

const label = (field: string) => field.replace(/([A-Z])/g, " $1").toLowerCase();

export function checkName(value: unknown, field = "name", max = 200): string {
  if (typeof value !== "string" || value.trim() === "") throw new ValidationError(`Enter a ${label(field)}.`);
  if (value.trim().length > max) throw new ValidationError(`The ${label(field)} is too long (at most ${max} characters).`);
  return value.trim();
}

export function checkText(value: unknown, field: string, max = 2000): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string") throw new ValidationError(`The ${label(field)} is not valid.`);
  if (value.length > max) throw new ValidationError(`The ${label(field)} is too long (at most ${max} characters).`);
}

export function checkMoney(value: unknown, field: string, { max = MAX_MONEY, min = 0 }: { max?: number; min?: number } = {}): void {
  if (value === undefined || value === null || value === "") return;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) throw new ValidationError(`The ${label(field)} is not a valid amount.`);
  if (n < min) throw new ValidationError(`The ${label(field)} cannot be negative.`);
  if (n > max) throw new ValidationError(`The ${label(field)} is too large.`);
}

export function checkCount(value: unknown, field: string, max = MAX_COUNT): void {
  if (value === undefined || value === null || value === "") return;
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(n) || n < 0) throw new ValidationError(`The ${label(field)} must be a number, zero or more.`);
  if (n > max) throw new ValidationError(`The ${label(field)} is too large.`);
}

export function checkEmail(value: unknown, field = "email"): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new ValidationError(`Enter a valid ${label(field)} address.`);
  }
}

/** Digits (with an optional leading +), 7 to 15 of them once spaces and dashes are taken out. */
export function checkPhone(value: unknown, field = "phone"): void {
  if (typeof value !== "string" || !/^\+?\d{7,15}$/.test(value.replace(/[\s\-().]/g, ""))) {
    throw new ValidationError(`Enter a valid ${label(field)} number.`);
  }
}

type Rules = {
  name?: string[];
  text?: Record<string, number>;
  money?: string[];
  count?: string[];
  email?: string[];
  phone?: string[];
};

/** Runs a set of rules over an input object; fields that are absent are left alone. */
export function validateInput(input: object, rules: Rules): void {
  const data = input as Record<string, unknown>;
  for (const f of rules.name ?? []) checkName(data[f], f);
  for (const [f, max] of Object.entries(rules.text ?? {})) checkText(data[f], f, max);
  for (const f of rules.money ?? []) checkMoney(data[f], f);
  for (const f of rules.count ?? []) checkCount(data[f], f);
  for (const f of rules.email ?? []) checkEmail(data[f], f);
  for (const f of rules.phone ?? []) checkPhone(data[f], f);
}

/** The pieces shared by an Order and a Quotation. */
export const ORDER_LIKE_RULES: Rules = {
  money: ["discount", "taxes", "additionalCharges", "deliveryCharges", "transportationCost", "otherCharges", "advance", "individualChildBelow5Rate", "individualChild5To10Rate"],
  count: ["adultCount", "childBelow5Count", "child5To10Count", "totalParticipants"],
  text: { notes: 5000, kitchenNotes: 5000, staffingNotes: 5000, terms: 5000, venue: 300, eventAddress: 1000, deliveryInstructions: 2000, cookingInstructions: 2000, venueAccessInstructions: 2000, venueLandmark: 300, venueContactName: 200 },
};

export function validateOrderLike(input: { mealPlanEntries?: Array<{ price?: unknown }> } & object): void {
  validateInput(input, ORDER_LIKE_RULES);
  for (const entry of input.mealPlanEntries ?? []) checkMoney(entry.price, "meal price");
}

export const RULES = {
  customer: { name: ["name"], phone: ["phone"], email: ["email"], text: { notes: 5000 } } satisfies Rules,
  menuItem: { name: ["name"], money: ["price"], text: { description: 5000 } } satisfies Rules,
  menu: { name: ["name"], money: ["pricePerPlate"], text: { description: 5000 } } satisfies Rules,
  addOn: { name: ["name"], money: ["price"], text: { description: 5000 } } satisfies Rules,
  category: { name: ["name"], text: { description: 5000 } } satisfies Rules,
  eventType: { name: ["name"], text: { description: 5000 }, count: ["minGuests"] } satisfies Rules,
  inventoryItem: { name: ["name"], text: { category: 100, unit: 50, storageLocation: 200 } } satisfies Rules,
  supplier: { name: ["name"], email: ["email"], text: { contactPerson: 200, address: 1000, gstin: 20, notes: 5000 } } satisfies Rules,
  staffMember: { name: ["name"], text: { notes: 2000 } } satisfies Rules,
  staffAssignment: { text: { notes: 500 } } satisfies Rules,
  eventTask: { name: ["title"], text: { notes: 1000 } } satisfies Rules,
  eventLogistics: { text: { vehicleType: 100, vehicleNumber: 30, driverName: 200, setupNotes: 2000 } } satisfies Rules,
  recipe: { text: { notes: 2000 } } satisfies Rules,
  expense: { text: { notes: 2000, supplierName: 200 }, money: ["amount"] } satisfies Rules,
};
