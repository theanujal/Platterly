import { parseCheckoutRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { startAutoPayCheckout, startCheckout } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/**
 * POST {planId, interval, buyer, autoPay?}: yearly (and monthly from older products) creates a Razorpay order and a PENDING
 * payment; monthly with `autoPay: true` creates a Razorpay subscription instead.
 */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseCheckoutRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    const { autoPay, ...checkout } = parsed.value;
    // Monthly from a product that can open the auto-pay window is a Razorpay subscription; yearly (and older products) stay orders.
    const answer = checkout.interval === "MONTHLY" && autoPay ? await startAutoPayCheckout({ businessId, productKey, planId: checkout.planId, buyer: checkout.buyer }) : await startCheckout({ businessId, productKey, ...checkout });
    return { body: answer };
  });
}
