import { handlePlatformInvoiceRequest } from "@/modules/platform-list/platform-plans";

export const dynamic = "force-dynamic";

/** GET: one paid invoice as a PDF for the Platform. Signed by the platform with the platform-reader secret; the answer is signed by Ops. */
export async function GET(request: Request, { params }: { params: Promise<{ businessId: string; productKey: string; paymentId: string }> }) {
  return handlePlatformInvoiceRequest(request, await params);
}
