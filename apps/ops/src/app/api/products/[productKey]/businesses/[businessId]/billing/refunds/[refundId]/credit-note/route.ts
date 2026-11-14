import { billingRoute } from "@/modules/billing/api";
import { getCreditNote } from "@/modules/billing/refunds";

export const dynamic = "force-dynamic";

/** GET: one credit note as a PDF (signed JSON with the file as base64) for a product's read-only Subscription page. Signed by the product; the answer is signed by Ops. */
export async function GET(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string; refundId: string }> }) {
  const { productKey, businessId, refundId } = await params;
  return billingRoute(request, productKey, async () => ({ body: await getCreditNote(businessId, productKey, refundId) }));
}
