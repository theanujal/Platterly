import "server-only";
import { newId, parsePlatformBusinessBilling, parsePlatformPlanCatalogue, platformBillingPath, PLATFORM_PLANS_PATH, type PlatformBusinessBilling, type PlatformPlanCatalogue } from "@platterly/contract";
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
