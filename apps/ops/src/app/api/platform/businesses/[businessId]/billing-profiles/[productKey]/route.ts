import { handleProductProfilePut } from "@/modules/platform-list/platform-product-billing-profiles";

export const dynamic = "force-dynamic";

/** PUT: save one product's billing profile, or copy another product's into it (billing secret). */
export async function PUT(request: Request, { params }: { params: Promise<{ businessId: string; productKey: string }> }) {
  const p = await params;
  return handleProductProfilePut(request, p.businessId, p.productKey);
}
