import { isRecord, fail, ok, type ParseResult } from "./result";

/**
 * The library review (docs/ops-contract.md section 30): what kitchens add that Platterly's library lacks, and a reviewer's
 * answer. The product sends candidates (read by Ops with a signed GET) and applies decisions (a signed POST from Ops).
 * Only names, category, Veg/Non-Veg, unit and a count cross: never a price, cost, stock, supplier, note or kitchen name.
 */
export const LIBRARY_KINDS = ["FOOD_ITEM", "INGREDIENT", "PHOTO", "CATEGORY"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export const LIBRARY_ACTIONS = ["approve", "merge", "reject"] as const;
export type LibraryAction = (typeof LIBRARY_ACTIONS)[number];
export const FOOD_TYPES = ["VEGETARIAN", "NON_VEGETARIAN"] as const;
export type LibraryFoodType = (typeof FOOD_TYPES)[number];

/** The choices a reviewer picks from. Catering's own lists (src/modules/inventory/options.ts) must match; a catering test checks it. */
export const LIBRARY_UNITS = ["kg", "g", "ltr", "ml", "pcs", "dozen", "box", "packet", "bag", "bottle"] as const;
export const LIBRARY_INGREDIENT_CATEGORIES = [
  "Grains & Cereals", "Pulses & Lentils", "Flours", "Spices & Masalas", "Oils & Ghee", "Dairy", "Vegetables", "Fruits", "Meat & Poultry", "Seafood",
  "Dry Fruits & Nuts", "Sugar & Sweeteners", "Beverages", "Packaging & Disposables", "Cleaning Supplies", "Fuel & Gas", "Other",
] as const;
/** The dish categories the library has today; a reviewer may also type a new one. */
export const LIBRARY_FOOD_CATEGORIES = ["Starters", "Main Course", "Breads", "Rice & Biryani", "Desserts", "Beverages", "Salads & Accompaniments", "Soups", "Breakfast", "Live Counters"] as const;

export const LIBRARY_LIMITS = { candidates: 500, name: 120, text: 500, id: 64 } as const;

export interface LibraryCandidateDoc {
  /** The product's own id for the candidate; Ops stores it and sends it back with a decision. */
  id: string;
  kind: LibraryKind;
  name: string;
  categoryName: string | null;
  foodType: LibraryFoodType | null;
  unit: string | null;
  /** How many different kitchens have it. */
  kitchenCount: number;
  /** A library item this looks like (a hint, never applied by itself). */
  suggestedMatchId: string | null;
  suggestedMatchName: string | null;
  /** PHOTO only: an https URL on the product's host. */
  photoUrl: string | null;
  updatedAt: string;
}

const text = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() !== "" && v.length <= max ? v.trim() : null);
const optText = (v: unknown, max: number): string | null | undefined => (v === undefined || v === null ? null : typeof v === "string" && v.length <= max ? (v.trim() || null) : undefined);

export function parseLibraryCandidates(input: unknown): ParseResult<{ candidates: LibraryCandidateDoc[] }> {
  if (!isRecord(input) || !Array.isArray(input.candidates)) return fail("candidates must be a list");
  if (input.candidates.length > LIBRARY_LIMITS.candidates) return fail(`at most ${LIBRARY_LIMITS.candidates} candidates`);
  const out: LibraryCandidateDoc[] = [];
  for (const [i, raw] of input.candidates.entries()) {
    if (!isRecord(raw)) return fail(`candidate ${i} must be an object`);
    const id = text(raw.id, LIBRARY_LIMITS.id);
    const name = text(raw.name, LIBRARY_LIMITS.name);
    if (!id || !name || !LIBRARY_KINDS.includes(raw.kind as LibraryKind)) return fail(`candidate ${i} needs id, name and a valid kind`);
    const foodType = raw.foodType === null || raw.foodType === undefined ? null : FOOD_TYPES.includes(raw.foodType as LibraryFoodType) ? (raw.foodType as LibraryFoodType) : undefined;
    const categoryName = optText(raw.categoryName, LIBRARY_LIMITS.name);
    const unit = optText(raw.unit, 40);
    const suggestedMatchId = optText(raw.suggestedMatchId, LIBRARY_LIMITS.id);
    const suggestedMatchName = optText(raw.suggestedMatchName, LIBRARY_LIMITS.name);
    const photoUrl = optText(raw.photoUrl, 500);
    if (foodType === undefined || categoryName === undefined || unit === undefined || suggestedMatchId === undefined || suggestedMatchName === undefined || photoUrl === undefined) return fail(`candidate ${i} has an invalid field`);
    if (photoUrl !== null && !/^https?:\/\//.test(photoUrl)) return fail(`candidate ${i} photoUrl must be a URL`);
    if (!Number.isInteger(raw.kitchenCount) || (raw.kitchenCount as number) < 0) return fail(`candidate ${i} kitchenCount is invalid`);
    out.push({ id, kind: raw.kind as LibraryKind, name, categoryName, foodType, unit, kitchenCount: raw.kitchenCount as number, suggestedMatchId, suggestedMatchName, photoUrl, updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : "" });
  }
  return ok({ candidates: out });
}

/** What the reviewer settled on. `approve` may carry corrected fields; `merge` names the library item the candidate is another name for. */
export interface LibraryDecision {
  candidateId: string;
  action: LibraryAction;
  /** approve: the final library entry (the reviewer may have corrected the name, category, type or unit). */
  entry?: { name: string; categoryName: string; foodType: LibraryFoodType | null; unit: string | null; description: string | null };
  /** merge: the library item id. */
  mergeIntoId?: string;
  /** approve of a PHOTO: replace a real photo that is already there. */
  replacePhoto?: boolean;
}

export function parseLibraryDecision(input: unknown): ParseResult<LibraryDecision> {
  if (!isRecord(input)) return fail("decision must be an object");
  const candidateId = text(input.candidateId, LIBRARY_LIMITS.id);
  if (!candidateId) return fail("candidateId is required");
  if (!LIBRARY_ACTIONS.includes(input.action as LibraryAction)) return fail("action must be approve, merge or reject");
  const action = input.action as LibraryAction;
  if (action === "reject") return ok({ candidateId, action });
  if (action === "merge") {
    const mergeIntoId = text(input.mergeIntoId, LIBRARY_LIMITS.id);
    return mergeIntoId ? ok({ candidateId, action, mergeIntoId }) : fail("merge needs mergeIntoId");
  }
  const replacePhoto = input.replacePhoto === true;
  if (input.entry === undefined) return ok({ candidateId, action, replacePhoto });
  if (!isRecord(input.entry)) return fail("entry must be an object");
  const e = input.entry;
  const name = text(e.name, LIBRARY_LIMITS.name);
  const categoryName = text(e.categoryName, LIBRARY_LIMITS.name);
  const foodType = e.foodType === null || e.foodType === undefined ? null : FOOD_TYPES.includes(e.foodType as LibraryFoodType) ? (e.foodType as LibraryFoodType) : undefined;
  const unit = optText(e.unit, 40);
  const description = optText(e.description, LIBRARY_LIMITS.text);
  if (!name || !categoryName || foodType === undefined || unit === undefined || description === undefined) return fail("entry needs a name and category, and valid type, unit and description");
  return ok({ candidateId, action, entry: { name, categoryName, foodType, unit, description }, replacePhoto });
}

/**
 * Editing the library itself (docs/ops-contract.md section 31). A CATEGORY entry is one of the library's dish categories:
 * `name` and `categoryName` are the same, `aliases` are other names kitchens use for it, and it has no type, unit or description. Ops lists the entries of one kind with a signed GET and changes
 * one entry with a signed POST. Only library data crosses: never anything a kitchen owns. Kitchens' own copies never change.
 */
export interface LibraryEntryDoc {
  id: string;
  kind: Exclude<LibraryKind, "PHOTO">;
  name: string;
  description: string | null;
  categoryName: string;
  foodType: LibraryFoodType | null;
  unit: string | null;
  aliases: string[];
  /** false = hidden from kitchens (still in the library, can be shown again). */
  isActive: boolean;
}

export const LIBRARY_ENTRY_LIMITS = { entries: 1500, aliases: 30 } as const;

export function parseLibraryEntries(input: unknown): ParseResult<{ entries: LibraryEntryDoc[] }> {
  if (!isRecord(input) || !Array.isArray(input.entries)) return fail("entries must be a list");
  if (input.entries.length > LIBRARY_ENTRY_LIMITS.entries) return fail(`at most ${LIBRARY_ENTRY_LIMITS.entries} entries`);
  const out: LibraryEntryDoc[] = [];
  for (const [i, raw] of input.entries.entries()) {
    if (!isRecord(raw)) return fail(`entry ${i} must be an object`);
    const id = text(raw.id, LIBRARY_LIMITS.id);
    const name = text(raw.name, LIBRARY_LIMITS.name);
    const categoryName = text(raw.categoryName, LIBRARY_LIMITS.name);
    const description = optText(raw.description, LIBRARY_LIMITS.text);
    const unit = optText(raw.unit, 40);
    const foodType = raw.foodType === null || raw.foodType === undefined ? null : FOOD_TYPES.includes(raw.foodType as LibraryFoodType) ? (raw.foodType as LibraryFoodType) : undefined;
    if (!id || !name || !categoryName || (raw.kind !== "FOOD_ITEM" && raw.kind !== "INGREDIENT" && raw.kind !== "CATEGORY") || description === undefined || unit === undefined || foodType === undefined || typeof raw.isActive !== "boolean") return fail(`entry ${i} is invalid`);
    const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((a): a is string => typeof a === "string" && a.length <= LIBRARY_LIMITS.name) : [];
    out.push({ id, kind: raw.kind, name, description, categoryName, foodType, unit, aliases: aliases.slice(0, LIBRARY_ENTRY_LIMITS.aliases), isActive: raw.isActive });
  }
  return ok({ entries: out });
}

/** The reviewer's change to one entry. Every field is optional; only what is present changes. */
export interface LibraryEntryUpdate {
  id: string;
  kind: Exclude<LibraryKind, "PHOTO">;
  name?: string;
  description?: string | null;
  categoryName?: string;
  foodType?: LibraryFoodType;
  unit?: string;
  /** The whole alias list (other names kitchens use for it). */
  aliases?: string[];
  isActive?: boolean;
}

export function parseLibraryEntryUpdate(input: unknown): ParseResult<LibraryEntryUpdate> {
  if (!isRecord(input)) return fail("update must be an object");
  const id = text(input.id, LIBRARY_LIMITS.id);
  if (!id || (input.kind !== "FOOD_ITEM" && input.kind !== "INGREDIENT" && input.kind !== "CATEGORY")) return fail("id and a valid kind are required");
  const update: LibraryEntryUpdate = { id, kind: input.kind };
  if (input.name !== undefined) {
    const v = text(input.name, LIBRARY_LIMITS.name);
    if (!v) return fail("name is invalid");
    update.name = v;
  }
  if (input.categoryName !== undefined) {
    const v = text(input.categoryName, LIBRARY_LIMITS.name);
    if (!v) return fail("categoryName is invalid");
    update.categoryName = v;
  }
  if (input.description !== undefined) {
    const v = optText(input.description, LIBRARY_LIMITS.text);
    if (v === undefined) return fail("description is invalid");
    update.description = v;
  }
  if (input.foodType !== undefined) {
    if (!FOOD_TYPES.includes(input.foodType as LibraryFoodType)) return fail("foodType is invalid");
    update.foodType = input.foodType as LibraryFoodType;
  }
  if (input.unit !== undefined) {
    const v = text(input.unit, 40);
    if (!v) return fail("unit is invalid");
    update.unit = v;
  }
  if (input.aliases !== undefined) {
    if (!Array.isArray(input.aliases) || input.aliases.length > LIBRARY_ENTRY_LIMITS.aliases || input.aliases.some((a) => typeof a !== "string" || a.trim() === "" || a.length > LIBRARY_LIMITS.name)) return fail("aliases are invalid");
    update.aliases = (input.aliases as string[]).map((a) => a.trim());
  }
  if (input.isActive !== undefined) {
    if (typeof input.isActive !== "boolean") return fail("isActive must be true or false");
    update.isActive = input.isActive;
  }
  return ok(update);
}
