import { billingRoute } from "@/modules/billing/api";
import { getStandInvoice } from "@/modules/stand/stand";

export const dynamic = "force-dynamic";

/** GET: the frozen GST invoice for one paid stand order. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string; orderId: string }> }) {
  const { productKey, businessId, orderId } = await params;
  return billingRoute(request, productKey, async () => ({ body: await getStandInvoice(businessId, productKey, orderId) }));
}
