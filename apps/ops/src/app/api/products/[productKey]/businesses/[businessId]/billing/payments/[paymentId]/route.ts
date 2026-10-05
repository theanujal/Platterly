import { billingRoute } from "@/modules/billing/api";
import { getInvoice } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** GET: the frozen invoice for one paid payment (numbers, GST split, seller and buyer as they were), so the product can print it. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string; paymentId: string }> }) {
  const { productKey, businessId, paymentId } = await params;
  return billingRoute(request, productKey, async () => ({ body: await getInvoice(businessId, productKey, paymentId) }));
}
