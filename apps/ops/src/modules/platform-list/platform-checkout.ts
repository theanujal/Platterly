import "server-only";
import { CONTRACT_VERSION, isId, isProductKey, parseBillingVerifyRequest, parseCheckoutRequest, parseMethodRequest, parseVerifyRequest, requestTarget, signedHeaders, verifyRequest, type PlatformBillingAction } from "@platterly/contract";
import { BillingError, cancelAutoPay, cancelScheduledDowngrade, cancelSubscription, failAutoPayCheckout, pauseAutoPay, quoteCheckout, reactivateSubscription, resumeAutoPay, scheduleDowngrade, startAutoPayCheckout, startCheckout, verifyAutoPayCheckout, verifyCheckout } from "@/modules/billing/billing";
import { methodsView, recordFirstMethod, removeMethod, startAddCard, startMakePrimary, verifyAddCard, verifyMakePrimary } from "@/modules/billing/methods";
import { platformRazorpay, RazorpayError } from "@/modules/billing/razorpay";

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
 * POST /api/platform/businesses/{businessId}/products/{productKey}/billing/{checkout|verify|quote|downgrade|undo-downgrade|cancel|reactivate}. Signed request in (route-bound, so a signature for one
 * business's route is no good for another's), signed answer out carrying the request's id. Anything wrong with the signature looks the same: 401. Platform has
 * already checked that the signed-in person may buy for this business; Ops checks that the business really is registered for the product (an unknown pair is 404).
 */
export async function handlePlatformBillingPost(request: Request, params: { businessId: string; productKey: string; action: PlatformBillingAction }): Promise<Response> {
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
      const { autoPay: _ignored, ...checkout } = parsed.value;
      // A monthly plan in the Store is always auto-pay (AJ, 2026-11-14): the flag is ignored. A yearly plan is a one-time order.
      if (checkout.interval === "MONTHLY") return reply(200, await startAutoPayCheckout({ businessId, productKey, planId: checkout.planId, buyer: checkout.buyer }));
      return reply(200, await startCheckout({ businessId, productKey, ...checkout }));
    }
    // Pause, resume and stop auto-pay (the Account's auto-renewal section): Ops's own functions, which check the state and say why when there is nothing to change.
    if (action === "autopay-pause" || action === "autopay-resume" || action === "autopay-cancel") {
      await { "autopay-pause": pauseAutoPay, "autopay-resume": resumeAutoPay, "autopay-cancel": cancelAutoPay }[action](businessId, productKey);
      return reply(200, { ok: true });
    }
    if (action === "methods") return reply(200, await methodsView(businessId, productKey));
    if (action === "method-add") return reply(200, await startAddCard(businessId, platformRazorpay()));
    if (action === "method-add-verify") {
      const parsed = parseVerifyRequest(json);
      if (!parsed.ok) return reply(400, { error: parsed.error });
      const method = await verifyAddCard({ businessId, ...parsed.value }, platformRazorpay());
      return reply(200, { ok: true, label: method.label });
    }
    if (action === "method-primary-verify") {
      const parsed = parseBillingVerifyRequest(json);
      if (!parsed.ok || !("razorpaySubscriptionId" in parsed.value) || "failed" in parsed.value) return reply(400, { error: parsed.ok ? "razorpaySubscriptionId, razorpayPaymentId and signature are required" : parsed.error });
      const method = await verifyMakePrimary({ businessId, productKey, ...parsed.value }, platformRazorpay());
      return reply(200, { ok: true, label: method.label });
    }
    if (action === "method-primary" || action === "method-remove") {
      const parsed = parseMethodRequest(json);
      if (!parsed.ok) return reply(400, { error: parsed.error });
      if (action === "method-primary") return reply(200, await startMakePrimary({ businessId, productKey, ...parsed.value }, platformRazorpay()));
      await removeMethod({ businessId, productKey, ...parsed.value }, platformRazorpay());
      return reply(200, { ok: true });
    }
    if (action === "quote" || action === "downgrade") {
      const o = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
      if (typeof o.planId !== "string" || !o.planId || o.planId.length > 80 || (o.interval !== "MONTHLY" && o.interval !== "ANNUAL")) return reply(400, { error: "planId and interval (MONTHLY or ANNUAL) are required" });
      if (action === "quote") return reply(200, await quoteCheckout({ businessId, productKey, planId: o.planId, interval: o.interval }));
      await scheduleDowngrade({ businessId, productKey, planId: o.planId, interval: o.interval });
      return reply(200, { ok: true });
    }
    if (action === "undo-downgrade") {
      await cancelScheduledDowngrade(businessId, productKey);
      return reply(200, { ok: true });
    }
    if (action === "cancel") {
      await cancelSubscription(businessId, productKey);
      return reply(200, { ok: true });
    }
    if (action === "reactivate") {
      await reactivateSubscription(businessId, productKey);
      return reply(200, { ok: true });
    }
    const parsed = parseBillingVerifyRequest(json);
    if (!parsed.ok) return reply(400, { error: parsed.error });
    if ("razorpaySubscriptionId" in parsed.value) {
      // The auto-pay window's own result: a setup that failed, or a first payment to confirm (then the method it was paid with is saved).
      if ("failed" in parsed.value) {
        const failed = await failAutoPayCheckout({ businessId, productKey, razorpaySubscriptionId: parsed.value.razorpaySubscriptionId, reason: parsed.value.failed.reason, detail: parsed.value.failed.detail });
        return reply(200, { ok: true, status: failed?.status ?? null, invoiceNumber: null });
      }
      const paid = await verifyAutoPayCheckout({ businessId, productKey, ...parsed.value });
      if (paid?.status === "PAID") await recordFirstMethod(businessId, parsed.value.razorpayPaymentId, parsed.value.razorpaySubscriptionId, platformRazorpay());
      return reply(200, { ok: true, status: paid?.status ?? null, invoiceNumber: paid?.invoiceNumber ?? null });
    }
    const payment = await verifyCheckout({ businessId, productKey, ...parsed.value });
    return reply(200, { ok: true, status: payment?.status ?? null, invoiceNumber: payment?.invoiceNumber ?? null });
  } catch (error) {
    if (error instanceof BillingError) return reply(error.message === "unknown_business" ? 404 : 400, { error: error.message });
    if (error instanceof RazorpayError) return reply(502, { error: "Razorpay could not be reached. Please try again." });
    console.error("[platform billing]", error);
    return reply(500, { error: "Something went wrong. Please try again." });
  }
}
