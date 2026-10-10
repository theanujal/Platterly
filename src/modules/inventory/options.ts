/**
 * The unit and category choices for Inventory Items, shared by the form, the Excel/CSV import and the ingredient
 * catalog. Pure data and functions (no imports) so the seed script and tests can load it directly.
 */
export const UNIT_OPTIONS = [
  { value: "kg", label: "Kilogram (kg)" },
  { value: "g", label: "Gram (g)" },
  { value: "ltr", label: "Liter (ltr)" },
  { value: "ml", label: "Milliliter (ml)" },
  { value: "pcs", label: "Piece (pcs)" },
  { value: "dozen", label: "Dozen" },
  { value: "box", label: "Box" },
  { value: "packet", label: "Packet" },
  { value: "bag", label: "Bag" },
  { value: "bottle", label: "Bottle" },
] as const;

export const CATEGORY_OPTIONS: readonly string[] = [
  "Grains & Cereals",
  "Pulses & Lentils",
  "Flours",
  "Spices & Masalas",
  "Oils & Ghee",
  "Dairy",
  "Vegetables",
  "Fruits",
  "Meat & Poultry",
  "Seafood",
  "Dry Fruits & Nuts",
  "Sugar & Sweeteners",
  "Beverages",
  "Packaging & Disposables",
  "Cleaning Supplies",
  "Fuel & Gas",
  "Other",
];

const UNIT_ALIASES: Record<string, string> = {
  kg: "kg", kgs: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg",
  g: "g", gm: "g", gms: "g", gram: "g", grams: "g", gr: "g",
  ltr: "ltr", l: "ltr", lt: "ltr", ltrs: "ltr", litre: "ltr", litres: "ltr", liter: "ltr", liters: "ltr",
  ml: "ml", mls: "ml", milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml",
  pcs: "pcs", pc: "pcs", piece: "pcs", pieces: "pcs", nos: "pcs", no: "pcs", unit: "pcs", units: "pcs", each: "pcs",
  dozen: "dozen", doz: "dozen", dz: "dozen",
  box: "box", boxes: "box",
  packet: "packet", packets: "packet", pkt: "packet", pkts: "packet", pack: "packet", packs: "packet",
  bag: "bag", bags: "bag", sack: "bag", sacks: "bag",
  bottle: "bottle", bottles: "bottle", btl: "bottle",
};

const clean = (s: string) => s.trim().toLowerCase().replace(/[().]/g, "").replace(/\s+/g, " ");

/** "Kilogram (kg)", "KGS", "litre" -> the stored unit value, or null when it is not one of the allowed units. */
export function normalizeUnit(raw: string): string | null {
  const v = clean(raw);
  const bracket = /\(([^)]+)\)/.exec(raw)?.[1];
  return UNIT_ALIASES[v] ?? (bracket ? UNIT_ALIASES[clean(bracket)] : undefined) ?? null;
}

/** Matches a category ignoring case and "&" / "and"; null when it is not one of the allowed categories. */
export function normalizeCategory(raw: string): string | null {
  const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, "");
  const target = key(raw);
  return CATEGORY_OPTIONS.find((c) => key(c) === target) ?? null;
}

/** The category illustration a catalog ingredient shows (public/catalog/ingredients). */
export function ingredientImage(categoryName: string): string {
  return `/catalog/ingredients/${categoryName.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.svg`;
}
