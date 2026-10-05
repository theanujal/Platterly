import { billingRoute } from "@/modules/billing/api";
import { listSellablePlans } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** GET: the paid plans on sale for this product, with GST worked out (signed by the product, answer signed by ops). */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string }> }) {
  const { productKey } = await params;
  return billingRoute(request, productKey, async () => ({ body: { plans: await listSellablePlans(productKey) } }));
}
