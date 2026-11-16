import "server-only";
import { newId, parseProductBillingProfileHistoryAnswer, platformProductBillingProfileHistoryPath, type ProductBillingProfileChange, parseProductBillingProfilesAnswer, platformProductBillingProfilesPath, type ProductBillingProfileRecord, platformInvoicePath, platformCreditNotePath, parsePlatformBusinessBilling, parsePlatformPlanCatalogue, parsePlatformProductCards, platformProductCardImagePath, PLATFORM_PRODUCT_CARDS_PATH, platformBillingPath, PLATFORM_PLANS_PATH, type PlatformBusinessBilling, type PlatformPlanCatalogue, type PlatformProductCards } from "@platterly/contract";
import { signPullRequest, verifyPullResponse } from "@platterly/platform-contract";

/**
 * Reads the plans on sale from Platterly Ops (Store first slice, F14.1.1): a signed GET with the platform-reader secret, a signed answer that must
 * carry the id of this request, then the contract's own shape check. Server side only: the secret never reaches the browser. A failure is a plain
 * reason code, never a body or a secret, and the Store shows its "not available" message: it never falls back to made-up prices.
 */
export type OpsReadFailure = "not_configured" | "unreachable" | "refused" | "bad_answer";
export type CatalogueResult = { ok: true; catalogue: PlatformPlanCatalogue } | { ok: false; reason: OpsReadFailure };
export type BillingResult = { ok: true; billing: PlatformBusinessBilling } | { ok: false; reason: OpsReadFailure | "not_found" };
type Deps = { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch; now?: number };

export const opsCatalogueConfigured = (env: NodeJS.ProcessEnv = process.env) => Boolean(env.OPS_BASE_URL && env.OPS_PLATFORM_READER_SECRET);

/** One signed GET to Ops and the verified JSON of its signed answer. */
async function signedOpsGet(path: string, deps: Deps): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; reason: OpsReadFailure | "not_found" }> {
  const env = deps.env ?? process.env;
  const base = env.OPS_BASE_URL;
  const secret = env.OPS_PLATFORM_READER_SECRET;
  if (!base || !secret) return { ok: false, reason: "not_configured" };
  const url = new URL(path, base);
  const requestId = newId("command");
  let response: Response;
  try {
    response = await (deps.fetchImpl ?? fetch)(url, { method: "GET", headers: signPullRequest(secret, requestId, url, deps.now), cache: "no-store", signal: AbortSignal.timeout(5000) });
  } catch {
    return { ok: false, reason: "unreachable" };
  }
  if (response.status === 404) return { ok: false, reason: "not_found" };
  if (!response.ok) return { ok: false, reason: "refused" };
  const verified = verifyPullResponse([secret], requestId, response.headers, await response.text(), deps.now);
  return verified.ok ? { ok: true, json: verified.value } : { ok: false, reason: "bad_answer" };
}

export async function fetchOpsCatalogue(deps: Deps = {}): Promise<CatalogueResult> {
  const got = await signedOpsGet(PLATFORM_PLANS_PATH, deps);
  if (!got.ok) return { ok: false, reason: got.reason === "not_found" ? "refused" : got.reason };
  const parsed = parsePlatformPlanCatalogue(got.json);
  return parsed.ok ? { ok: true, catalogue: parsed.value } : { ok: false, reason: "bad_answer" };
}

/**
 * One business's subscriptions and payments from Ops. The caller must already have checked that the signed-in person is a member of this business with the
 * right to view billing: Ops answers for any business id it knows, and the answer must be for the business that was asked about.
 */
export async function fetchOpsBilling(businessId: string, deps: Deps = {}): Promise<BillingResult> {
  const got = await signedOpsGet(platformBillingPath(businessId), deps);
  if (!got.ok) return got;
  const parsed = parsePlatformBusinessBilling(got.json);
  if (!parsed.ok || parsed.value.businessId !== businessId) return { ok: false, reason: "bad_answer" };
  return { ok: true, billing: parsed.value };
}

/** Every per-product billing profile of one business (signed read). The caller must already have checked the person is the business's Admin. */
export async function fetchOpsProductBillingProfiles(businessId: string, deps: Deps = {}): Promise<{ ok: true; profiles: ProductBillingProfileRecord[] } | { ok: false; reason: OpsReadFailure | "not_found" }> {
  const got = await signedOpsGet(platformProductBillingProfilesPath(businessId), deps);
  if (!got.ok) return got;
  const parsed = parseProductBillingProfilesAnswer(got.json);
  return parsed.ok ? { ok: true, profiles: parsed.value.profiles } : { ok: false, reason: "bad_answer" };
}

/** The changes made to one product's billing profile (signed read). The caller must already have checked the person is the business's Admin. */
export async function fetchOpsProductBillingProfileHistory(businessId: string, productKey: string, deps: Deps = {}): Promise<{ ok: true; history: ProductBillingProfileChange[] } | { ok: false; reason: OpsReadFailure | "not_found" }> {
  const got = await signedOpsGet(platformProductBillingProfileHistoryPath(businessId, productKey), deps);
  if (!got.ok) return got;
  const parsed = parseProductBillingProfileHistoryAnswer(got.json);
  return parsed.ok ? { ok: true, history: parsed.value.history } : { ok: false, reason: "bad_answer" };
}

export type InvoiceResult = { ok: true; fileName: string; pdf: Buffer } | { ok: false; reason: OpsReadFailure | "not_found" };

/**
 * One paid invoice as a PDF, from Ops's frozen record (signed read; the answer is signed JSON carrying the file as base64). The caller must already have
 * checked that the signed-in person may see this business's billing, and Ops answers only for a payment that belongs to that business and product.
 */
export async function fetchOpsInvoice(businessId: string, opsProductKey: string, paymentId: string, deps: Deps = {}): Promise<InvoiceResult> {
  const got = await signedOpsGet(platformInvoicePath(businessId, opsProductKey, paymentId), deps);
  if (!got.ok) return got;
  const { fileName, pdfBase64 } = got.json;
  if (typeof fileName !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(fileName) || typeof pdfBase64 !== "string") return { ok: false, reason: "bad_answer" };
  const pdf = Buffer.from(pdfBase64, "base64");
  return pdf.subarray(0, 5).toString("latin1") === "%PDF-" ? { ok: true, fileName, pdf } : { ok: false, reason: "bad_answer" };
}

/** One credit note as a PDF, the same way as an invoice: a signed read, scoped by Ops to the business and product, the file as base64 in the signed answer. */
export async function fetchOpsCreditNote(businessId: string, opsProductKey: string, refundId: string, deps: Deps = {}): Promise<InvoiceResult> {
  const got = await signedOpsGet(platformCreditNotePath(businessId, opsProductKey, refundId), deps);
  if (!got.ok) return got;
  const { fileName, pdfBase64 } = got.json;
  if (typeof fileName !== "string" || !/^[A-Za-z0-9._-]{1,80}$/.test(fileName) || typeof pdfBase64 !== "string") return { ok: false, reason: "bad_answer" };
  const pdf = Buffer.from(pdfBase64, "base64");
  return pdf.subarray(0, 5).toString("latin1") === "%PDF-" ? { ok: true, fileName, pdf } : { ok: false, reason: "bad_answer" };
}

export type ProductCardsResult = { ok: true; cards: PlatformProductCards } | { ok: false; reason: OpsReadFailure };

/** The product cards (My Products) from Ops: a signed read with the read-only secret. Ops owns the names, lines, pictures and launch dates; nothing is made up here. */
export async function fetchOpsProductCards(deps: Deps = {}): Promise<ProductCardsResult> {
  const got = await signedOpsGet(PLATFORM_PRODUCT_CARDS_PATH, deps);
  if (!got.ok) return { ok: false, reason: got.reason === "not_found" ? "refused" : got.reason };
  const parsed = parsePlatformProductCards(got.json);
  return parsed.ok ? { ok: true, cards: parsed.value } : { ok: false, reason: "bad_answer" };
}

export type CardImageResult = { ok: true; mime: string; bytes: Buffer } | { ok: false; reason: OpsReadFailure | "not_found" };
const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** One uploaded card picture from Ops (signed read, the file as base64 in the signed answer). Only an image type is passed on. */
export async function fetchOpsCardImage(name: string, deps: Deps = {}): Promise<CardImageResult> {
  const got = await signedOpsGet(platformProductCardImagePath(name), deps);
  if (!got.ok) return got;
  const { mime, bytesBase64 } = got.json;
  if (typeof mime !== "string" || !IMAGE_MIMES.has(mime) || typeof bytesBase64 !== "string") return { ok: false, reason: "bad_answer" };
  return { ok: true, mime, bytes: Buffer.from(bytesBase64, "base64") };
}
