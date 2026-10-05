import { billingRoute } from "@/modules/billing/api";
import { getBillingView } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** GET: one business's subscription, history and paid payments, for the product's own billing screens. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => ({ body: await getBillingView(businessId, productKey) }));
}
