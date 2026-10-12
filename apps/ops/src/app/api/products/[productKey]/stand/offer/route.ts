import { billingRoute } from "@/modules/billing/api";
import { getStandOffer } from "@/modules/stand/stand";

export const dynamic = "force-dynamic";

/** GET: the price of one Order QR stand (with GST) and whether it is on sale. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string }> }) {
  const { productKey } = await params;
  return billingRoute(request, productKey, async () => ({ body: await getStandOffer(productKey) }));
}
