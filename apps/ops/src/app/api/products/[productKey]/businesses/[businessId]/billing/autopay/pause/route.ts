import { billingRoute } from "@/modules/billing/api";
import { pauseAutoPay } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** POST: "Pause subscription": Razorpay stops charging; the paid days run out as usual. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => {
    await pauseAutoPay(businessId, productKey);
    return { body: { ok: true } };
  });
}
