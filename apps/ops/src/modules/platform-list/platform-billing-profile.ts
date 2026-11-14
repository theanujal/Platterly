import "server-only";
import { CONTRACT_VERSION, isId, parseBillingProfileRequest, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { audit } from "@/lib/audit";
import { getBillingProfile, saveBillingProfile } from "@/modules/billing/billing-profile";
import { platformBillingSecrets } from "./platform-checkout";
import { readerSecrets } from "./platform-list";

/**
 * GET and PUT /api/platform/businesses/{businessId}/billing-profile: a business's saved billing details (F12.2.1).
 * GET is read-only and uses the platform-reader secret like the other reads; PUT saves and uses the platform-billing secret, so a secret that can only read can never
 * change the details an invoice is made from. Both are route-bound (a signature for one business's route is no good for another's) and signed answers carry the
 * request's id. Platform has already checked that the signed-in person is the business's active Admin; Ops checks that the business exists and that the details pass
 * the same checks as the forms. Anything wrong with the signature looks the same: 401.
 */
export async function handleBillingProfileGet(request: Request, businessId: string): Promise<Response> {
  const unauthorized = Response.json({ error: "unauthorized" }, { status: 401 });
  if (process.env.NODE_ENV === "production" && request.headers.get("x-forwarded-proto") !== "https") return unauthorized;
  const secrets = await readerSecrets();
  if (!secrets) return unauthorized;
  const verified = verifyRequest(secrets.accept, request.headers, "", { target: requestTarget(request.method, request.url) });
  if (!verified.ok) return unauthorized;
  if (verified.contract > CONTRACT_VERSION) return Response.json({ error: `contract ${verified.contract} is not supported` }, { status: 400 });
  const data = isId("business", businessId) ? await getBillingProfile(businessId) : null;
  if (!data) return Response.json({ error: "not_found" }, { status: 404 });
  const text = JSON.stringify(data);
  return new Response(text, { headers: { ...signedHeaders(secrets.sign, verified.id, text), "cache-control": "no-store" } });
}

export async function handleBillingProfilePut(request: Request, businessId: string): Promise<Response> {
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
  if (!isId("business", businessId)) return reply(404, { error: "unknown_business" });
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "body is not JSON" });
  }
  const parsed = parseBillingProfileRequest(json);
  if (!parsed.ok) return reply(400, { error: parsed.error });
  try {
    if (!(await saveBillingProfile(businessId, parsed.value.buyer, "account"))) return reply(404, { error: "unknown_business" });
    await audit({ actorUserId: null, action: "billing.profile_saved", subject: businessId, detail: { source: "account", editedBy: parsed.value.editedBy ?? null } });
    return reply(200, (await getBillingProfile(businessId)) ?? { profile: null, updatedAt: null });
  } catch (error) {
    console.error("[billing profile]", error);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}
