import { handleProductProfileHistoryGet } from "@/modules/platform-list/platform-product-billing-profiles";

export const dynamic = "force-dynamic";

/** GET: the changes made to one product's billing profile, newest first (read-only secret). */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; productKey: string }> }) {
  const p = await params;
  return handleProductProfileHistoryGet(request, p.businessId, p.productKey);
}
