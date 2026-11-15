import { handleProductProfilesGet } from "@/modules/platform-list/platform-product-billing-profiles";

export const dynamic = "force-dynamic";

/** GET: every billing profile a business has, one per product (read-only secret). */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string }> }) {
  return handleProductProfilesGet(request, (await params).businessId);
}
