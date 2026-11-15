import { checkBillingProfile } from "./billing-profile";
import { isProductKey } from "./ids";
import { fail, isIsoDate, isRecord, ok, type ParseResult } from "./result";

/**
 * A business's billing profile for one product. Ops keeps one record per business and product; the Account and the product's own Business Profile edit that same
 * record. Every save names the version it was based on (`baseVersion`, null for a first save); Ops refuses a stale one with 409 and the current record.
 * The logo is a link: the product keeps the file.
 */
export const PROFILE_TEXT_FIELDS = ["name", "brandName", "contactName", "contactEmail", "contactPhone", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "gstin", "description", "website", "instagram", "facebook", "logoUrl"] as const;
export type ProductProfileField = (typeof PROFILE_TEXT_FIELDS)[number];
export type ProductProfileFields = { name: string } & Record<Exclude<ProductProfileField, "name">, string | null>;
export interface ProductBillingProfileRecord extends ProductProfileFields {
  productKey: string;
  version: number;
  /** "account" or "product": where the last change came from. */
  source: string;
  updatedAt: string;
}

const MAX: Partial<Record<ProductProfileField, number>> = { description: 2000, website: 300, instagram: 300, facebook: 300, logoUrl: 500 };
const URL_FIELDS: ProductProfileField[] = ["website", "instagram", "facebook", "logoUrl"];

/** What the Platform sends to save one product's profile (`copyFrom` instead of `fields` copies another product's profile once). */
export interface ProductBillingProfileRequest {
  baseVersion: number | null;
  fields?: ProductProfileFields;
  copyFrom?: string;
  editedBy?: string;
  source: "account" | "product";
}

/**
 * `lenient` is for a save made in the product itself: the product's form does not ask for a billing contact, so a profile it saves may still be incomplete (the Account
 * shows it as incomplete). Whatever IS given must still be well formed. The Account's own save stays strict.
 */
function parseFields(input: unknown, lenient = false): ParseResult<ProductProfileFields> {
  if (!isRecord(input)) return fail("fields must be an object");
  const out: Record<string, string | null> = {};
  for (const key of PROFILE_TEXT_FIELDS) {
    const v = input[key];
    if (v === undefined || v === null) { out[key] = null; continue; }
    if (typeof v !== "string") return fail(`fields.${key} must be text`);
    const t = v.trim();
    if (t.length > (MAX[key] ?? 200)) return fail(`fields.${key} is too long`);
    if (URL_FIELDS.includes(key) && t && !/^https?:\/\/\S+$/i.test(t)) return fail(`fields.${key} must be a web link`);
    out[key] = t || null;
  }
  if (!out.name) return fail("fields.name is required");
  const gstin = out.gstin ? out.gstin.toUpperCase() : null;
  const value = { ...out, gstin } as ProductProfileFields;
  const problems = lenient ? checkLenient(value) : checkBillingProfile({ name: value.name, addressLine1: value.addressLine1, addressLine2: value.addressLine2, city: value.city, state: value.state, postalCode: value.postalCode, country: value.country, gstin: value.gstin, contactName: value.contactName, contactEmail: value.contactEmail, contactPhone: value.contactPhone });
  const first = Object.entries(problems)[0];
  return first ? fail(`fields.${first[0]}: ${first[1]}`) : ok(value);
}

function checkLenient(v: ProductProfileFields): Record<string, string> {
  const all = checkBillingProfile({ name: v.name, addressLine1: v.addressLine1 || "x", addressLine2: v.addressLine2, city: v.city || "x", state: v.state || "x", postalCode: v.postalCode || "000000", country: v.country || "x", gstin: v.gstin, contactName: v.contactName || "x", contactEmail: v.contactEmail || "x@x.xx", contactPhone: v.contactPhone || "9876543210" });
  return all;
}

export function parseProductBillingProfileRequest(input: unknown, options: { lenient?: boolean } = {}): ParseResult<ProductBillingProfileRequest> {
  if (!isRecord(input)) return fail("body must be an object");
  const base = input.baseVersion;
  if (base !== null && !(typeof base === "number" && Number.isInteger(base) && base >= 1)) return fail("baseVersion must be a version number or null");
  if (input.source !== "account" && input.source !== "product") return fail("source must be account or product");
  if (input.editedBy !== undefined && (typeof input.editedBy !== "string" || !input.editedBy || input.editedBy.length > 100)) return fail("editedBy must be short text");
  const common = { baseVersion: base as number | null, source: input.source as "account" | "product", ...(typeof input.editedBy === "string" ? { editedBy: input.editedBy } : {}) };
  if (input.copyFrom !== undefined) {
    if (!isProductKey(input.copyFrom)) return fail("copyFrom must be a product key");
    return ok({ ...common, copyFrom: input.copyFrom });
  }
  const fields = parseFields(input.fields, options.lenient);
  return fields.ok ? ok({ ...common, fields: fields.value }) : fields;
}

/** A stored profile as Ops sends it or answers with it: well formed, not re-checked field by field (it was checked when saved). */
export function parseProductBillingProfileRecord(input: unknown): ParseResult<ProductBillingProfileRecord> {
  if (!isRecord(input)) return fail("profile must be an object");
  if (!isProductKey(input.productKey)) return fail("profile.productKey is invalid");
  if (typeof input.version !== "number" || !Number.isInteger(input.version) || input.version < 1) return fail("profile.version is invalid");
  if (typeof input.source !== "string" || !isIsoDate(input.updatedAt)) return fail("profile.source and updatedAt are required");
  const out: Record<string, string | null> = {};
  for (const key of PROFILE_TEXT_FIELDS) {
    const v = input[key];
    if (v !== null && typeof v !== "string") return fail(`profile.${key} must be text or null`);
    out[key] = v as string | null;
  }
  if (!out.name) return fail("profile.name is required");
  return ok({ ...(out as ProductProfileFields), productKey: input.productKey, version: input.version, source: input.source, updatedAt: input.updatedAt });
}

/** Ops's answer to a read: every profile the business has, one per product. */
export interface ProductBillingProfilesAnswer { profiles: ProductBillingProfileRecord[] }
export function parseProductBillingProfilesAnswer(input: unknown): ParseResult<ProductBillingProfilesAnswer> {
  if (!isRecord(input) || !Array.isArray(input.profiles)) return fail("answer must have profiles");
  const profiles: ProductBillingProfileRecord[] = [];
  for (const p of input.profiles) {
    const r = parseProductBillingProfileRecord(p);
    if (!r.ok) return r;
    profiles.push(r.value);
  }
  return ok({ profiles });
}

/** Ops's answer to a save: the saved profile (200), or the current one with 409 (null when the profile does not exist). */
export function parseProductBillingProfileAnswer(input: unknown): ParseResult<{ profile: ProductBillingProfileRecord }> {
  if (!isRecord(input)) return fail("answer must be an object");
  const r = parseProductBillingProfileRecord(input.profile);
  return r.ok ? ok({ profile: r.value }) : r;
}
export function parseProductBillingProfileConflict(input: unknown): ParseResult<{ current: ProductBillingProfileRecord | null }> {
  if (!isRecord(input) || !("current" in input)) return fail("conflict must carry current");
  if (input.current === null) return ok({ current: null });
  const r = parseProductBillingProfileRecord(input.current);
  return r.ok ? ok({ current: r.value }) : r;
}

/** One change to a profile, as the Change History tab lists it. `changes` is empty for the first save. */
export interface ProductBillingProfileChange {
  at: string;
  version: number;
  /** "account" or "product": where the change was made. */
  source: string;
  /** The Platform's id for the person who saved it in the Account; absent for a save made in the product. */
  editedBy: string | null;
  created: boolean;
  changes: { field: string; from: string | null; to: string | null }[];
}
export interface ProductBillingProfileHistoryAnswer { history: ProductBillingProfileChange[] }
export function parseProductBillingProfileHistoryAnswer(input: unknown): ParseResult<ProductBillingProfileHistoryAnswer> {
  if (!isRecord(input) || !Array.isArray(input.history)) return fail("answer must have history");
  const history: ProductBillingProfileChange[] = [];
  for (const h of input.history) {
    if (!isRecord(h) || !isIsoDate(h.at) || typeof h.version !== "number" || typeof h.source !== "string" || typeof h.created !== "boolean" || !Array.isArray(h.changes)) return fail("history entry is malformed");
    if (h.editedBy !== null && typeof h.editedBy !== "string") return fail("history editedBy is malformed");
    const changes: ProductBillingProfileChange["changes"] = [];
    for (const c of h.changes) {
      if (!isRecord(c) || typeof c.field !== "string" || (c.from !== null && typeof c.from !== "string") || (c.to !== null && typeof c.to !== "string")) return fail("history change is malformed");
      changes.push({ field: c.field, from: c.from as string | null, to: c.to as string | null });
    }
    history.push({ at: h.at, version: h.version, source: h.source, editedBy: h.editedBy as string | null, created: h.created, changes });
  }
  return ok({ history });
}
export const platformProductBillingProfileHistoryPath = (businessId: string, productKey: string) => `/api/platform/businesses/${businessId}/billing-profiles/${productKey}/history`;

/** `GET` lists a business's profiles (platform-reader secret). */
export const platformProductBillingProfilesPath = (businessId: string) => `/api/platform/businesses/${businessId}/billing-profiles`;
/** `PUT` saves one product's profile (platform-billing secret). */
export const platformProductBillingProfilePath = (businessId: string, productKey: string) => `/api/platform/businesses/${businessId}/billing-profiles/${productKey}`;
export const PLATFORM_PRODUCT_BILLING_PROFILES_PATH_PATTERN = /^\/api\/platform\/businesses\/biz_[0-9a-f]{32}\/billing-profiles(\/[a-z][a-z0-9-]{1,31}(\/history)?)?$/;
