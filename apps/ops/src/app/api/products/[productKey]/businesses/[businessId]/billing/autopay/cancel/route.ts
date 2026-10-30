import { billingRoute } from "@/modules/billing/api";
import { cancelAutoPay } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** POST: "Cancel subscription": Razorpay stops charging now, for good; the paid days run out as usual. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => {
    await cancelAutoPay(businessId, productKey);
    return { body: { ok: true } };
  });
}
