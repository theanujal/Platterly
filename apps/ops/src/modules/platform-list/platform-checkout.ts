import "server-only";
import { CONTRACT_VERSION, isId, isProductKey, parseBillingVerifyRequest, parseCheckoutRequest, requestTarget, signedHeaders, verifyRequest } from "@platterly/contract";
import { BillingError, startCheckout, verifyCheckout } from "@/modules/billing/billing";
import { RazorpayError } from "@/modules/billing/razorpay";

/**
 * The platform-billing secrets: what Platform signs its Store buy calls with. NOT the platform-reader secret, so a secret that can only read can never
 * start or confirm a payment. They come from the environment (`PLATFORM_BILLING_SECRETS`, comma separated: the current one first, the previous one only while
 * a rotation is unfinished). Each must be at least 32 characters; anything shorter counts as not set, and until one is set every buy call answers 401.
 */
export function platformBillingSecrets(env: NodeJS.ProcessEnv = process.env): { accept: string[]; sign: string } | null {
  const all = (env.PLATFORM_BILLING_SECRETS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (all.length === 0 || all.some((s) => s.length < 32)) return null;
  return { accept: all, sign: all[0] };
}

/**
 * POST /api/platform/businesses/{businessId}/products/{productKey}/billing/{checkout|verify}. Signed request in (route-bound, so a signature for one
 * business's route is no good for another's), signed answer out carrying the request's id. Anything wrong with the signature looks the same: 401. Platform has
 * already checked that the signed-in person may buy for this business; Ops checks that the business really is registered for the product (an unknown pair is 404).
 */
export async function handlePlatformBillingPost(request: Request, params: { businessId: string; productKey: string; action: "checkout" | "verify" }): Promise<Response> {
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
  const { businessId, productKey, action } = params;
  if (!isId("business", businessId) || !isProductKey(productKey)) return reply(404, { error: "unknown_business" });
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return reply(400, { error: "body is not JSON" });
  }
  try {
    if (action === "checkout") {
      const parsed = parseCheckoutRequest(json);
      if (!parsed.ok) return reply(400, { error: parsed.error });
      // One-time payments only for now (auto-pay is not offered in the Store yet): `autoPay` is ignored, so monthly is a 30-day order as well.
      const { autoPay: _ignored, ...checkout } = parsed.value;
      return reply(200, await startCheckout({ businessId, productKey, ...checkout }));
    }
    const parsed = parseBillingVerifyRequest(json);
    if (!parsed.ok) return reply(400, { error: parsed.error });
    if (!("razorpayOrderId" in parsed.value)) return reply(400, { error: "only one-time payments can be verified here" });
    const payment = await verifyCheckout({ businessId, productKey, ...parsed.value });
    return reply(200, { ok: true, status: payment?.status ?? null, invoiceNumber: payment?.invoiceNumber ?? null });
  } catch (error) {
    if (error instanceof BillingError) return reply(error.message === "unknown_business" ? 404 : 400, { error: error.message });
    if (error instanceof RazorpayError) return reply(502, { error: "Razorpay could not be reached. Please try again." });
    console.error("[platform billing]", error);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}
