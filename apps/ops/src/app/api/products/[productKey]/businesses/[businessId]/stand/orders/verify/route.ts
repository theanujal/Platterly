import { parseVerifyRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { verifyStandCheckout } from "@/modules/stand/stand";

export const dynamic = "force-dynamic";

/** POST {razorpayOrderId, razorpayPaymentId, signature}: checks Razorpay Checkout's signature and confirms the order once. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseVerifyRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const order = await verifyStandCheckout({ businessId, productKey, ...parsed.value });
    return { body: { ok: true, orderId: order?.id ?? null } };
  });
}
