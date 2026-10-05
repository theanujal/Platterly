import { parseCheckoutRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { startCheckout } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** POST {planId, interval, buyer}: creates a Razorpay order with Platterly's keys and a PENDING payment. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseCheckoutRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    return { body: await startCheckout({ businessId, productKey, ...parsed.value }) };
  });
}
