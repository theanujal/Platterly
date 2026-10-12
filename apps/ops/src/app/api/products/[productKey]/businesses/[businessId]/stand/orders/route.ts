import { parseStandCheckoutRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { listStandOrders, startStandCheckout } from "@/modules/stand/stand";

export const dynamic = "force-dynamic";

/** GET: this business's paid stand orders. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => ({ body: { orders: await listStandOrders(businessId, productKey) } }));
}

/** POST {quantity, shipTo, buyer, kitchenName, kitchenLogoUrl, linkUrl}: creates a Razorpay order and a PENDING stand order. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseStandCheckoutRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    return { body: await startStandCheckout({ businessId, productKey, ...parsed.value }) };
  });
}
