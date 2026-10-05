import { parseDowngradeRequest } from "@platterly/contract";
import { billingRoute, parseJson } from "@/modules/billing/api";
import { cancelScheduledDowngrade, scheduleDowngrade } from "@/modules/billing/billing";

export const dynamic = "force-dynamic";

/** POST {planId, interval}: a lower plan that starts at the next payment, never now. */
export async function POST(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async ({ rawBody }) => {
    const parsed = parseDowngradeRequest(parseJson(rawBody));
    if (!parsed.ok) return { status: 400, body: { error: parsed.error } };
    await scheduleDowngrade({ businessId, productKey, ...parsed.value });
    return { body: { ok: true } };
  });
}

/** DELETE: cancels a scheduled downgrade. */
export async function DELETE(request: Request, { params }: { params: Promise<{ productKey: string; businessId: string }> }) {
  const { productKey, businessId } = await params;
  return billingRoute(request, productKey, async () => {
    await cancelScheduledDowngrade(businessId, productKey);
    return { body: { ok: true } };
  });
}
