import { parseBillingVerifyRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { failAutoPayCheckout, verifyAutoPayCheckout, verifyCheckout } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/**
 * POST {razorpayOrderId | razorpaySubscriptionId, razorpayPaymentId, signature}: checks Razorpay Checkout's signature and
 * confirms the payment (or the auto-pay's first charge) once. POST {razorpaySubscriptionId, failed: {reason, detail}}: the
 * checkout window says the auto-pay setup was declined or not finished, which Razorpay never tells ops.
 */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseBillingVerifyRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const v = parsed.value;
    const payment = "razorpayOrderId" in v ? await verifyCheckout({ businessId, productKey, ...v }) : "failed" in v ? await failAutoPayCheckout({ businessId, productKey, razorpaySubscriptionId: v.razorpaySubscriptionId, ...v.failed }) : await verifyAutoPayCheckout({ businessId, productKey, ...v });
    return { body: { ok: true, status: payment?.status ?? null, invoiceNumber: payment?.invoiceNumber ?? null } };
  });
}
