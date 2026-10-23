import { billingRoute } from "@/modules/billing/api";
import { resumeAutoPay } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** POST: "Resume": auto-pay on again. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => {
    await resumeAutoPay(businessId, productKey);
    return { body: { ok: true } };
  });
}
