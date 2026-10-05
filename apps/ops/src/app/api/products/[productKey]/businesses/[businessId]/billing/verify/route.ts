import { parseVerifyRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { verifyCheckout } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** POST {razorpayOrderId, razorpayPaymentId, signature}: checks Razorpay Checkout's signature and confirms the payment once. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseVerifyRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const payment = await verifyCheckout({ businessId, productKey, ...parsed.value });
    return { body: { ok: true, status: payment?.status ?? null, invoiceNumber: payment?.invoiceNumber ?? null } };
  });
}
