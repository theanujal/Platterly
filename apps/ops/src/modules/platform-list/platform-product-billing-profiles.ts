import "server-only";
import { CONTRACT_VERSION, isId, isProductKey, parseProductBillingProfileRequest, requestTarget, signedHeaders, verifyRequest, type ProductBillingProfileRecord } from "@platterly/contract";
import { sendCommand } from "@/modules/commands/outbox";
import { saveBillingProfile } from "@/modules/billing/billing-profile";
import { productBillingProfileHistory, copyProductBillingProfile, listProductBillingProfiles, saveProductBillingProfile, type ProductBillingProfile, type SaveResult } from "@/modules/billing/product-billing-profile";
import { prisma } from "@/lib/db";
import { platformBillingSecrets } from "./platform-checkout";
import { readerSecrets } from "./platform-list";

/**
 * GET /api/platform/businesses/{businessId}/billing-profiles and PUT .../billing-profiles/{productKey}: the per-product billing profiles. Same rules as the
 * older single-profile route: route-bound signatures, read-only secret for GET, billing secret for PUT, signed answers carrying the request's id, anything wrong
 * with the signature is 401. A stale save is 409 with the current record so the screen can show what changed.
 */
export const toRecord = ({ businessId: _b, ...rest }: ProductBillingProfile): ProductBillingProfileRecord => { void _b; return rest as ProductBillingProfileRecord; };

/**
 * Tells the product its profile changed (it keeps a read copy). Queued with a retry like every command, one per version so a repeat is not sent twice. A save the
 * product made itself is never pushed back. A failure to queue never fails the save: the product also refreshes its copy when its Business Profile page opens.
 */
async function pushToProduct(businessId: string, productKey: string, profile: ProductBillingProfileRecord): Promise<void> {
  try {
    if (!(await prisma.businessProduct.findUnique({ where: { businessId_productKey: { businessId, productKey } }, select: { businessId: true } }))) return;
    await sendCommand({ productKey, dedupeKey: `billing-profile:${businessId}:${productKey}:${profile.version}`, command: { type: "billing_profile.set", businessId, payload: { profile } } });
  } catch (error) {
    console.error("[product billing profile push]", error);
  }
}

export async function handleProductProfilesGet(request: Request, businessId: string): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = await readerSecrets();
  if (!secrets) return unauthorized;
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  if (!isId("business", businessId)) return Response.json({ error: "not_found" }, { status: 404 });
  const text = JSON.stringify({ profiles: (await listProductBillingProfiles(businessId)).map(toRecord) });
  return new Response(text, { headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
}

export async function handleProductProfileHistoryGet(request: Request, businessId: string, productKey: string): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = await readerSecrets();
  if (!secrets) return unauthorized;
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  if (!isId("business", businessId) || !isProductKey(productKey)) return Response.json({ error: "not_found" }, { status: 404 });
  const text = JSON.stringify({ history: await productBillingProfileHistory(businessId, productKey) });
  return new Response(text, { headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
}

export async function handleProductProfilePut(request: Request, businessId: string, productKey: string): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = platformBillingSecrets();
  if (!secrets) return unauthorized;
  const rawBody = await request.text();
  if (rawBody.length > 32 * 1024) return Response.json({ error: "body too large" }, { status: 413 });
  const verified = verifyRequest(secrets.accept, request.headers, rawBody, { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  const reply = (status: number, body: unknown) => {
    const text = JSON.stringify(body);
    return new Response(text, { status, headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
  };
  if (!isId("business", businessId) || !isProductKey(productKey)) return reply(404, { error: "unknown_business" });
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "body is not JSON" });
  }
  const parsed = parseProductBillingProfileRequest(json);
  if (!parsed.ok) return reply(400, { error: parsed.error });
  const req = parsed.value;
  try {
    const editor = { source: req.source, editedBy: req.editedBy };
    let result: SaveResult | { ok: false; reason: "no_source" };
    if (req.copyFrom) {
      if (req.copyFrom === productKey) return reply(400, { error: "copyFrom must be a different product" });
      result = await copyProductBillingProfile({ businessId, fromProductKey: req.copyFrom, toProductKey: productKey, baseVersion: req.baseVersion, ...editor });
    } else {
      result = await saveProductBillingProfile({ businessId, productKey, fields: req.fields!, baseVersion: req.baseVersion, ...editor });
    }
    if (result.ok) {
      // Until Store checkout and the billing emails read the per-product profile, they still read the business's single record: keep it in step with the latest save.
      const p = result.profile;
      await saveBillingProfile(businessId, { name: p.name, addressLine1: p.addressLine1, addressLine2: p.addressLine2, city: p.city, state: p.state, postalCode: p.postalCode, country: p.country, gstin: p.gstin, contactName: p.contactName, contactEmail: p.contactEmail, contactPhone: p.contactPhone }, "account");
      if (req.source === "account") await pushToProduct(businessId, productKey, toRecord(p));
      return reply(200, { profile: toRecord(p) });
    }
    if (result.reason === "not_found") return reply(404, { error: "unknown_business" });
    if (result.reason === "no_source") return reply(400, { error: "The product to copy from has no billing profile." });
    return reply(409, { error: "conflict", current: result.current ? toRecord(result.current) : null });
  } catch (error) {
    console.error("[product billing profile]", error);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}
