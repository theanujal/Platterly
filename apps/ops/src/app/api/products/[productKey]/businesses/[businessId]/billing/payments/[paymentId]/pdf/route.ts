import { billingRoute } from "@/modules/billing/api";
import { getInvoicePdf } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** GET: one paid invoice as a PDF (signed JSON with the file as base64) for a product's read-only Subscription page. Signed by the product; the answer is signed by Ops. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string; paymentId: string }> }) {
  const { productKey, businessId, paymentId } = await params;
  return billingRoute(request, productKey, async () => ({ body: await getInvoicePdf(businessId, productKey, paymentId) }));
}
