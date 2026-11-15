import "server-only";
import { checkBillingProfile, type Buyer, isProductKey, parseProductBillingProfileRequest, type ProductBillingProfileChange, type ProductBillingProfileRecord, type ProductBillingProfileRequest } from "@platterly/contract";
import type { Session } from "@/lib/session";
import { billingAccess } from "./billing-rights";
import { fetchOpsProductBillingProfileHistory, fetchOpsBilling, fetchOpsBillingProfile, fetchOpsProductBillingProfiles, type OpsReadFailure } from "./ops-catalogue";
import { saveOpsProductBillingProfile, type CheckoutFailure } from "./ops-checkout";

/**
 * The Account's per-product billing profiles: the signed-in Admin's business, read from and saved through Ops. The business is never named by the request.
 * A save carries `baseVersion`, the version the person was looking at; when Ops says it changed since, the result is `conflict` with the current record.
 */
export type ProductProfilesFailure = "not_signed_in" | "no_business" | "not_admin" | "bad_request" | OpsReadFailure | "not_found" | CheckoutFailure;
export type ProductProfilesResult =
  | { ok: true; businessName: string; profiles: ProductBillingProfileRecord[] }
  | { ok: false; reason: ProductProfilesFailure; message?: string; fields?: Record<string, string> };
export type ProductProfileSaveResult =
  | { ok: true; profile: ProductBillingProfileRecord }
  | { ok: false; reason: "conflict"; current: ProductBillingProfileRecord | null }
  | { ok: false; reason: ProductProfilesFailure; message?: string; fields?: Record<string, string> };

const refusal = (status: "unauthenticated" | "no_business" | "not_admin"): { ok: false; reason: ProductProfilesFailure } => ({ ok: false, reason: status === "unauthenticated" ? "not_signed_in" : status });

export async function loadMyProductBillingProfiles(session: Session | null): Promise<ProductProfilesResult> {
  const access = await billingAccess(session);
  if (access.status !== "ok") return refusal(access.status);
  const got = await fetchOpsProductBillingProfiles(access.businessId);
  // A business Ops does not know yet has no profiles.
  if (!got.ok) return got.reason === "not_found" ? { ok: true, businessName: access.businessName, profiles: [] } : { ok: false, reason: got.reason };
  return { ok: true, businessName: access.businessName, profiles: got.profiles };
}

export async function saveMyProductBillingProfile(session: Session | null, productKey: string, input: unknown): Promise<ProductProfileSaveResult> {
  const access = await billingAccess(session);
  if (access.status !== "ok" || !session) return refusal(access.status === "ok" ? "unauthenticated" : access.status);
  if (!isProductKey(productKey) || !input || typeof input !== "object") return { ok: false, reason: "bad_request" };
  const body = { ...(input as Record<string, unknown>), source: "account", editedBy: session.userId };
  const parsed = parseProductBillingProfileRequest(body);
  if (!parsed.ok) {
    // Field-by-field messages for the form, the same checks Ops runs.
    const f = (input as { fields?: Record<string, unknown> }).fields;
    const str = (k: string) => (typeof f?.[k] === "string" ? (f[k] as string).trim() || null : null);
    const fields = f ? (checkBillingProfile({ name: str("name") ?? "", addressLine1: str("addressLine1"), addressLine2: str("addressLine2"), city: str("city"), state: str("state"), postalCode: str("postalCode"), country: str("country"), gstin: str("gstin"), contactName: str("contactName"), contactEmail: str("contactEmail"), contactPhone: str("contactPhone") }) as Record<string, string>) : {};
    return { ok: false, reason: "bad_request", message: parsed.error, ...(Object.keys(fields).length ? { fields } : {}) };
  }
  const request: ProductBillingProfileRequest = parsed.value;
  const got = await saveOpsProductBillingProfile({ businessId: access.businessId, productKey, request });
  if (!got.ok) return got;
  return "conflict" in got.answer ? { ok: false, reason: "conflict", current: got.answer.current } : { ok: true, profile: got.answer.profile };
}

/** What the Account page shows: the business's products, each product's saved profile (if any), and the business's older single record as a starting point for a product with none. */
export type ProfilesPage = { businessName: string; products: { productKey: string; name: string }[]; profiles: ProductBillingProfileRecord[]; legacy: Buyer | null };
export type ProfilesPageResult = { ok: true; page: ProfilesPage } | { ok: false; reason: ProductProfilesFailure };

export async function loadMyBillingProfilesPage(session: Session | null): Promise<ProfilesPageResult> {
  const access = await billingAccess(session);
  if (access.status !== "ok") return refusal(access.status);
  const [list, billing, legacy] = await Promise.all([fetchOpsProductBillingProfiles(access.businessId), fetchOpsBilling(access.businessId), fetchOpsBillingProfile(access.businessId)]);
  if (!list.ok && list.reason !== "not_found") return { ok: false, reason: list.reason };
  const profiles = list.ok ? list.profiles : [];
  // A business Ops does not know yet has no products; one Ops knows lists every product it uses, subscribed or not.
  const products = billing.ok ? billing.billing.products.map((p) => ({ productKey: p.productKey, name: p.name })) : [];
  for (const p of profiles) if (!products.some((x) => x.productKey === p.productKey)) products.push({ productKey: p.productKey, name: p.productKey });
  return { ok: true, page: { businessName: access.businessName, products, profiles, legacy: legacy.ok ? legacy.answer.profile : null } };
}

/** The Change History tab: each change with who made it ("you", a teammate, or the product itself). The person's own id never leaves the server. */
export type HistoryEntry = Omit<ProductBillingProfileChange, "editedBy"> & { by: "you" | "someone" | "product" | "payment" };
export async function loadMyProductBillingProfileHistory(session: Session | null, productKey: string): Promise<{ ok: true; history: HistoryEntry[] } | { ok: false; reason: ProductProfilesFailure }> {
  const access = await billingAccess(session);
  if (access.status !== "ok" || !session) return refusal(access.status === "ok" ? "unauthenticated" : access.status);
  if (!isProductKey(productKey)) return { ok: false, reason: "bad_request" };
  const got = await fetchOpsProductBillingProfileHistory(access.businessId, productKey);
  if (!got.ok) return got.reason === "not_found" ? { ok: true, history: [] } : { ok: false, reason: got.reason };
  return { ok: true, history: got.history.map(({ editedBy, ...h }) => ({ ...h, by: h.source === "product" ? "product" : h.source === "payment" ? "payment" : editedBy === session.userId ? "you" : "someone" })) };
}
